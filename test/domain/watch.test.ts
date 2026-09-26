import { EventEmitter } from "node:events";
import { expect, test } from "bun:test";
import type { FSWatcher } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { watchProject } from "../../src/domain/watch.ts";

type WatchListener = (eventType: string, filename: string | Buffer | null) => void;

// Real-clock waits are intentional: these integration tests exercise OS fs.watch events together with the debounce and reconcile timers.
async function until(predicate: () => boolean, timeout = 2_000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("Project refresh did not observe the file change.");
    await Bun.sleep(20);
  }
}

function silentWatchFactory(
  active: Set<string>,
  closed: Set<string>,
  listeners = new Map<string, WatchListener>(),
) {
  return (directory: string, listener: WatchListener): FSWatcher => {
    const watcher = new EventEmitter() as EventEmitter & { close(): void };
    listeners.set(directory, listener);
    active.add(directory);
    watcher.close = () => {
      active.delete(directory);
      closed.add(directory);
    };
    return watcher as unknown as FSWatcher;
  };
}

test("watch coalesces real edits, ignores unrelated root files, and stops on close", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-watch-"));
  const changes = path.join(root, "openspec", "changes", "alpha");
  const specs = path.join(root, "openspec", "specs");
  await mkdir(changes, { recursive: true });
  await mkdir(specs, { recursive: true });
  const input = path.join(changes, "tasks.md");
  const spec = path.join(specs, "contract.md");
  await writeFile(input, "baseline");
  await writeFile(spec, "baseline spec");
  const errors: Error[] = [];
  const reasons: string[] = [];
  const subscription = watchProject(root, reason => { reasons.push(reason); }, error => errors.push(error), {
    debounceMs: 60,
    reconcileMs: 40,
  });
  try {
    await subscription.ready;
    await writeFile(input, "first edit");
    await Bun.sleep(10);
    await writeFile(spec, "edited spec");
    await writeFile(input, "second edit");
    await Bun.sleep(10);
    await writeFile(input, "final edit");
    await until(() => reasons.length > 0);
    await Bun.sleep(140);
    expect(reasons).toEqual(["event"]);
    expect(await readFile(input, "utf8")).toBe("final edit");
    expect(await readFile(spec, "utf8")).toBe("edited spec");

    await writeFile(input, "final edit");
    await Bun.sleep(140);
    expect(reasons).toEqual(["event"]);

    await writeFile(path.join(root, "README.txt"), "outside OpenSpec");
    await Bun.sleep(140);
    expect(reasons).toEqual(["event"]);

    subscription.close();
    const settled = reasons.length;
    await writeFile(input, "edit after close");
    await Bun.sleep(100);
    expect(reasons.length).toBe(settled);
    expect(errors).toEqual([]);
  } finally {
    subscription.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("reconciles missed same-size edits and new paths once while updating directory watches", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-watch-missed-"));
  const openspec = path.join(root, "openspec");
  const specs = path.join(openspec, "specs");
  await mkdir(specs, { recursive: true });
  const input = path.join(specs, "contract.md");
  await writeFile(input, "before");
  const reasons: string[] = [];
  const active = new Set<string>();
  const closed = new Set<string>();
  const subscription = watchProject(root, reason => { reasons.push(reason); }, () => {}, {
    debounceMs: 20,
    reconcileMs: 40,
    watchDirectory: silentWatchFactory(active, closed),
  });
  try {
    await subscription.ready;
    await writeFile(input, "after!");
    await until(() => reasons.length === 1);
    expect(reasons).toEqual(["reconcile"]);
    await Bun.sleep(120);
    expect(reasons).toEqual(["reconcile"]);

    const newChange = path.join(openspec, "changes", "new-change");
    await mkdir(newChange, { recursive: true });
    await writeFile(path.join(newChange, "tasks.md"), "new relevant input");
    await until(() => reasons.length === 2);
    expect(reasons).toEqual(["reconcile", "reconcile"]);
    expect(active.has(newChange)).toBe(true);
    await Bun.sleep(120);
    expect(reasons).toEqual(["reconcile", "reconcile"]);

    await rm(newChange, { recursive: true, force: true });
    await until(() => !active.has(newChange));
    await until(() => reasons.length === 3);
    expect(reasons).toEqual(["reconcile", "reconcile", "reconcile"]);
    expect(closed.has(newChange)).toBe(true);
    await Bun.sleep(120);
    expect(reasons).toHaveLength(3);
  } finally {
    subscription.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("close cancels a debounced event without calling back later", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-watch-close-"));
  const specs = path.join(root, "openspec", "specs");
  await mkdir(specs, { recursive: true });
  const listeners = new Map<string, WatchListener>();
  const reasons: string[] = [];
  const subscription = watchProject(root, reason => { reasons.push(reason); }, () => {}, {
    debounceMs: 80,
    reconcileMs: 1_000,
    watchDirectory: silentWatchFactory(new Set(), new Set(), listeners),
  });
  try {
    await subscription.ready;
    listeners.get(specs)?.("change", "contract.md");
    subscription.close();
    await Bun.sleep(120);
    expect(reasons).toEqual([]);
  } finally {
    subscription.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("watch refuses symlinked OpenSpec roots and nested inputs", async () => {
  const external = await mkdtemp(path.join(tmpdir(), "opsx-watch-external-"));
  const linkedRoot = await mkdtemp(path.join(tmpdir(), "opsx-watch-link-"));
  await symlink(external, path.join(linkedRoot, "openspec"));
  const rootSubscription = watchProject(linkedRoot, () => {}, () => {});
  try {
    await expect(rootSubscription.ready).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  } finally {
    rootSubscription.close();
    await rm(linkedRoot, { recursive: true, force: true });
  }

  const nestedRoot = await mkdtemp(path.join(tmpdir(), "opsx-watch-nested-link-"));
  const nestedSpecs = path.join(nestedRoot, "openspec", "specs");
  await mkdir(nestedSpecs, { recursive: true });
  await symlink(external, path.join(nestedSpecs, "linked"));
  const nestedSubscription = watchProject(nestedRoot, () => {}, () => {});
  try {
    await expect(nestedSubscription.ready).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  } finally {
    nestedSubscription.close();
    await Promise.all([rm(nestedRoot, { recursive: true, force: true }), rm(external, { recursive: true, force: true })]);
  }
});

test("watch bounds the size of inventoried inputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-watch-size-"));
  const specs = path.join(root, "openspec", "specs");
  await mkdir(specs, { recursive: true });
  const oversized = path.join(specs, "large.md");
  await writeFile(oversized, "");
  await truncate(oversized, 8 * 1024 * 1024 + 1);
  const subscription = watchProject(root, () => {}, () => {});
  try {
    await expect(subscription.ready).rejects.toMatchObject({ code: "UNSAFE_PATH" });
  } finally {
    subscription.close();
    await rm(root, { recursive: true, force: true });
  }
});
