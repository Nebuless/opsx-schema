import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { OpsxError } from "../domain/project.ts";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ENTRIES = 2000;

export function changeName(name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new OpsxError("UNSAFE_PATH", `Unsafe change name: ${name}`);
  return name;
}

async function storageRoot(root: string, archived: boolean): Promise<string> {
  const project = await realpath(root);
  let parent = project;
  for (const part of ["openspec", "changes", ...(archived ? ["archive"] : [])]) {
    parent = path.join(parent, part);
    if ((await lstat(parent)).isSymbolicLink()) throw new OpsxError("UNSAFE_PATH", `Change storage contains symlink: ${parent}`);
  }
  return parent;
}

export async function listArchived(root: string): Promise<Array<{ name: string }>> {
  let entries;
  try {
    const parent = await storageRoot(root, true);
    entries = await readdir(parent, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries.filter(entry => entry.isDirectory() && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry.name))
    .map(entry => ({ name: entry.name })).sort((a, b) => b.name.localeCompare(a.name));
}

export async function changeDirectory(root: string, name: string, archived = false): Promise<string> {
  changeName(name);
  const parent = await storageRoot(root, archived);
  const directory = path.join(parent, name);
  try {
    const base = await realpath(parent);
    const actual = await realpath(directory);
    if (path.dirname(actual) !== base || !(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) {
      throw new OpsxError("UNSAFE_PATH", `Change directory escapes ${parent}: ${name}`);
    }
    return actual;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new OpsxError("CHANGE_NOT_FOUND", `Change ${name} not found in ${parent}.`);
    throw error;
  }
}

export async function boundedFile(directory: string, relative: string): Promise<{ content: string; bytes: number }> {
  if (!relative || relative.includes("\\") || relative.includes("\0") || path.isAbsolute(relative) || relative.split("/").some(part => !part || part === "." || part === "..")) {
    throw new OpsxError("UNSAFE_PATH", `Unsafe change file path: ${relative}`);
  }
  const root = await realpath(directory);
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) throw new OpsxError("UNSAFE_PATH", `Change file escapes its root: ${relative}`);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new OpsxError("UNSAFE_PATH", `Symlink in change file path: ${relative}`);
  }
  const info = await stat(target);
  if (!info.isFile()) throw new OpsxError("FILE_NOT_TEXT", `Not a regular file: ${relative}`);
  if (info.size > MAX_FILE_BYTES) throw new OpsxError("FILE_TOO_LARGE", `File ${relative} exceeds ${MAX_FILE_BYTES} bytes.`);
  const bytes = await readFile(target);
  if (bytes.includes(0)) throw new OpsxError("FILE_NOT_TEXT", `Binary file cannot be displayed: ${relative}`);
  try {
    return { content: new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes: bytes.length };
  } catch {
    throw new OpsxError("FILE_NOT_TEXT", `Non-UTF-8 file cannot be displayed: ${relative}`);
  }
}

export async function listFiles(directory: string): Promise<string[]> {
  const root = await realpath(directory);
  const files: string[] = [];
  async function walk(relative: string): Promise<void> {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
      const name = path.posix.join(relative.replaceAll(path.sep, "/"), entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.push(name);
      if (files.length > MAX_ENTRIES) throw new OpsxError("ARCHIVE_TOO_LARGE", `Change contains more than ${MAX_ENTRIES} files.`);
    }
  }
  await walk("");
  return files.sort();
}

export async function archivedRecord(root: string, name: string) {
  const directory = await changeDirectory(root, name, true);
  return { name, files: await listFiles(directory) };
}

export async function archivedFile(root: string, name: string, relative: string) {
  const directory = await changeDirectory(root, name, true);
  return boundedFile(directory, relative);
}
