import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { OpsxError, resolveProject } from "./domain/project.ts";

const LOCK_DIRECTORY = "openspec";
export const PROJECT_LOCK_FILE = ".opsx-switch.lock";

async function ensureLockDirectory(root: string): Promise<void> {
  let current = root;
  for (const part of LOCK_DIRECTORY.split("/")) {
    current = path.join(current, part);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new OpsxError(
        "PROJECT_LOCK_UNSAFE",
        `Project lock directory is not a real directory: ${current}`,
      );
  }
}

export async function acquireProjectMutationLock(
  rootInput: string,
): Promise<() => Promise<void>> {
  const root = await resolveProject(rootInput, true);
  await ensureLockDirectory(root);
  const lockPath = path.join(root, LOCK_DIRECTORY, PROJECT_LOCK_FILE);
  const token = `${randomUUID()}\n`;
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new OpsxError(
        "PROJECT_LOCKED",
        "Another project mutation owns openspec/.opsx-switch.lock.",
      );
    throw error;
  }
  try {
    await handle.writeFile(token, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    try {
      if ((await readFile(lockPath, "utf8")) === token) await unlink(lockPath);
    } catch {
      // Preserve the acquisition error; a remaining lock is safer than stealing one.
    }
    throw error;
  }
  return async () => {
    try {
      const info = await lstat(lockPath);
      if (info.isSymbolicLink() || !info.isFile()) return;
      if ((await readFile(lockPath, "utf8")) === token) await unlink(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}

export async function withProjectMutationLock<T>(
  root: string,
  work: () => Promise<T>,
): Promise<T> {
  const release = await acquireProjectMutationLock(root);
  try {
    return await work();
  } finally {
    await release();
  }
}
