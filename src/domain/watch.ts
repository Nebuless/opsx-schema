import { constants, watch } from "node:fs";
import type { BigIntStats, FSWatcher } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { OpsxError } from "./project.ts";

const MAX_WATCH_DIRECTORIES = 2_048;
const MAX_INPUT_FILES = 16_384;
const MAX_INVENTORY_ENTRIES = 18_432;
const MAX_INPUT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const HASH_BUFFER_BYTES = 64 * 1024;

type ChangeReason = "event" | "reconcile";
type WatchListener = (
  eventType: string,
  filename: string | Buffer | null,
) => void;
type WatchDirectory = (directory: string, listener: WatchListener) => FSWatcher;
type Timer = NodeJS.Timeout;

export interface ProjectSubscription {
  ready: Promise<void>;
  close(): void;
}

/** Watch local OpenSpec inputs and reconcile missed or newly created paths. */
export function watchProject(
  root: string,
  onChange: (reason: ChangeReason) => void,
  onError: (error: Error) => void,
  options: {
    debounceMs?: number;
    reconcileMs?: number;
    watchDirectory?: WatchDirectory;
  } = {},
): ProjectSubscription {
  const debounceMs = options.debounceMs ?? 120;
  const reconcileMs = options.reconcileMs ?? 2_000;
  const createWatcher =
    options.watchDirectory ??
    ((directory, listener) => watch(directory, listener));
  const watchers = new Map<string, FSWatcher>();
  const hashBuffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  let closed = false;
  let initialized = false;
  let lastSignature: string | undefined;
  let pending: Timer | undefined;
  let interval: Timer | undefined;
  let scanning: Promise<void> | undefined;
  let queuedReason: ChangeReason | undefined;

  function reportError(error: unknown) {
    if (!closed)
      onError(error instanceof Error ? error : new Error(String(error)));
  }

  function queueReason(reason: ChangeReason) {
    if (reason === "event" || queuedReason === undefined) queuedReason = reason;
  }

  function scheduleEvent() {
    if (closed) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      pending = undefined;
      requestScan("event");
    }, debounceMs);
  }

  function updateWatchers(desired: Set<string>) {
    if (closed) return;
    for (const [directory, watcher] of watchers) {
      if (desired.has(directory)) continue;
      watcher.close();
      watchers.delete(directory);
    }
    for (const directory of desired) {
      if (watchers.has(directory)) continue;
      try {
        const watcher = createWatcher(directory, (_eventType, filename) => {
          if (closed) return;
          if (
            directory === root &&
            filename != null &&
            filename.toString() !== "openspec"
          )
            return;
          scheduleEvent();
        });
        watcher.on("error", reportError);
        watchers.set(directory, watcher);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  async function readInputInventory(): Promise<{
    directories: Set<string>;
    signature: string;
  }> {
    const openspecRoot = path.join(root, "openspec");
    const directories = new Set<string>([root]);
    const stack = [openspecRoot];
    const entries: string[] = [];
    let fileCount = 0;
    let entryCount = 0;
    let totalBytes = 0;

    while (stack.length) {
      const directory = stack.pop()!;
      let info;
      try {
        info = await lstat(directory, { bigint: true });
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new OpsxError(
          "UNSAFE_PATH",
          `OpenSpec watcher refuses a non-directory or symlink: ${directory}`,
        );
      }

      let names;
      try {
        names = await readdir(directory);
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      const afterRead = await lstat(directory, { bigint: true }).catch(
        (error) => {
          if (isMissing(error)) return undefined;
          throw error;
        },
      );
      if (!afterRead) continue;
      if (
        !afterRead.isDirectory() ||
        afterRead.isSymbolicLink() ||
        !sameIdentity(info, afterRead)
      ) {
        throw new OpsxError(
          "UNSAFE_PATH",
          `OpenSpec watcher refuses a changed directory path: ${directory}`,
        );
      }

      directories.add(directory);
      if (directories.size > MAX_WATCH_DIRECTORIES) {
        throw new Error(
          `OpenSpec directory watch limit exceeded (${MAX_WATCH_DIRECTORIES}).`,
        );
      }
      entries.push(
        `d\0${path.relative(openspecRoot, directory).split(path.sep).join("/")}\0`,
      );

      for (const name of names) {
        if (++entryCount > MAX_INVENTORY_ENTRIES) {
          throw new Error(
            `OpenSpec input inventory entry limit exceeded (${MAX_INVENTORY_ENTRIES}).`,
          );
        }
        const filePath = path.join(directory, name);
        let child;
        try {
          child = await lstat(filePath, { bigint: true });
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        if (child.isSymbolicLink()) {
          throw new OpsxError(
            "UNSAFE_PATH",
            `OpenSpec watcher refuses a symlink: ${filePath}`,
          );
        }
        if (child.isDirectory()) {
          stack.push(filePath);
          continue;
        }
        if (!child.isFile()) {
          throw new OpsxError(
            "UNSAFE_PATH",
            `OpenSpec watcher refuses a non-regular input: ${filePath}`,
          );
        }
        if (++fileCount > MAX_INPUT_FILES) {
          throw new Error(
            `OpenSpec input inventory file limit exceeded (${MAX_INPUT_FILES}).`,
          );
        }
        if (child.size > BigInt(MAX_INPUT_FILE_BYTES)) {
          throw new OpsxError(
            "UNSAFE_PATH",
            `OpenSpec input exceeds the ${MAX_INPUT_FILE_BYTES}-byte inventory limit: ${filePath}`,
          );
        }

        const content = await digestFile(filePath, child);
        if (!content) continue;
        totalBytes += content.size;
        if (totalBytes > MAX_INPUT_BYTES) {
          throw new Error(
            `OpenSpec input inventory byte limit exceeded (${MAX_INPUT_BYTES}).`,
          );
        }
        entries.push(
          `f\0${path.relative(openspecRoot, filePath).split(path.sep).join("/")}\0${content.size}\0${content.digest}\0`,
        );
      }
    }

    entries.sort();
    const signature = createHash("sha256");
    for (const entry of entries) signature.update(entry);
    return { directories, signature: signature.digest("hex") };
  }

  async function digestFile(
    filePath: string,
    expected: BigIntStats,
  ): Promise<{ size: number; digest: string } | undefined> {
    let file;
    try {
      file = await open(
        filePath,
        constants.O_RDONLY |
          (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0),
      );
    } catch (error) {
      if (isMissing(error)) return undefined;
      if ((error as NodeJS.ErrnoException).code === "ELOOP") {
        throw new OpsxError(
          "UNSAFE_PATH",
          `OpenSpec watcher refuses a symlink: ${filePath}`,
        );
      }
      throw error;
    }

    try {
      const opened = await file.stat({ bigint: true });
      if (
        !opened.isFile() ||
        opened.isSymbolicLink() ||
        !sameIdentity(expected, opened)
      ) {
        throw new OpsxError(
          "UNSAFE_PATH",
          `OpenSpec input changed to an unsafe path: ${filePath}`,
        );
      }
      if (opened.size > BigInt(MAX_INPUT_FILE_BYTES)) {
        throw new OpsxError(
          "UNSAFE_PATH",
          `OpenSpec input exceeds the ${MAX_INPUT_FILE_BYTES}-byte inventory limit: ${filePath}`,
        );
      }

      const hash = createHash("sha256");
      let size = 0;
      for (;;) {
        const { bytesRead } = await file.read(
          hashBuffer,
          0,
          hashBuffer.length,
          null,
        );
        if (bytesRead === 0) break;
        size += bytesRead;
        if (size > MAX_INPUT_FILE_BYTES) {
          throw new OpsxError(
            "UNSAFE_PATH",
            `OpenSpec input exceeds the ${MAX_INPUT_FILE_BYTES}-byte inventory limit: ${filePath}`,
          );
        }
        hash.update(hashBuffer.subarray(0, bytesRead));
      }
      return { size, digest: hash.digest("hex") };
    } finally {
      await file.close();
    }
  }

  async function scan(): Promise<string> {
    const inventory = await readInputInventory();
    updateWatchers(inventory.directories);
    return inventory.signature;
  }

  function requestScan(reason: ChangeReason) {
    if (closed) return;
    if (!initialized || scanning) {
      queueReason(reason);
      return;
    }

    scanning = (async () => {
      let nextReason: ChangeReason | undefined = reason;
      while (nextReason && !closed) {
        queuedReason = undefined;
        let signature: string | undefined;
        try {
          signature = await scan();
        } catch (error) {
          reportError(error);
        }
        if (closed) break;
        if (
          signature !== undefined &&
          signature !== lastSignature &&
          pending === undefined
        ) {
          const changedReason = queuedReason === "event" ? "event" : nextReason;
          lastSignature = signature;
          try {
            onChange(changedReason);
          } catch (error) {
            reportError(error);
          }
        }
        nextReason = queuedReason;
      }
    })().finally(() => {
      scanning = undefined;
      if (!closed && queuedReason) {
        const reason = queuedReason;
        queuedReason = undefined;
        requestScan(reason);
      }
    });
  }

  async function initialize() {
    const initial = await readInputInventory();
    updateWatchers(initial.directories);
    const readyInventory = await readInputInventory();
    updateWatchers(readyInventory.directories);
    if (closed) return;

    lastSignature = readyInventory.signature;
    initialized = true;
    interval = setInterval(() => {
      if (!closed && pending === undefined) requestScan("reconcile");
    }, reconcileMs);
    if (queuedReason) {
      const reason = queuedReason;
      queuedReason = undefined;
      requestScan(reason);
    }
  }

  const ready = initialize();
  return {
    ready,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      clearTimeout(pending);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}

function isMissing(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}
