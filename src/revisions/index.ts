import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { schema } from "../catalog/schemas.ts";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";
import { boundedFile } from "../archive/index.ts";
import { identifyBundledSchemaSource } from "../bundled/index.ts";

export interface BundledRevisionSource { name: string; version: string; revision: string; digest: string }
export interface RevisionRef { name: string; source: string; digest: string; bundleSource?: BundledRevisionSource }
export interface Revision extends RevisionRef { shadows: unknown[]; files: string[] }
export type RevisionCheck = { state: "intact" | "missing" | "drift" | "shadow"; revision?: Revision; retained: boolean };

function validName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new OpsxError("REVISION_NAME", `Unsafe schema revision name: ${name}`);
}

async function contents(root: string): Promise<{ digest: string; files: string[] }> {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new OpsxError("REVISION_UNSAFE", `Revision root is not a real directory: ${root}`);
  const files: string[] = [];
  const hash = createHash("sha256");
  async function walk(directory: string): Promise<void> {
    const entries = (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new OpsxError("REVISION_UNSAFE", `Symlink in schema revision: ${relative}`);
      if (entry.isDirectory()) await walk(relative);
      else if (entry.isFile() && !["README.md", "AGENTS.md"].includes(entry.name)) files.push(relative);
      else if (!entry.isFile()) throw new OpsxError("REVISION_UNSAFE", `Unsupported entry in schema revision: ${relative}`);
    }
  }
  await walk("");
  files.sort();
  if (!files.includes("schema.yaml")) throw new OpsxError("REVISION_INVALID", `Schema at ${root} has no schema.yaml.`);
  for (const relative of files) {
    const bytes = await readFile(path.join(root, relative));
    hash.update(relative).update("\0").update(String(bytes.length)).update("\0").update(bytes);
  }
  return { digest: hash.digest("hex"), files };
}

export async function resolveRevision(client: OpenSpecClient, name: string): Promise<Revision> {
  validName(name);
  const selected = await schema(client, name);
  const source = await realpath(selected.path);
  if (!(await lstat(source)).isDirectory()) throw new OpsxError("REVISION_INVALID", `Schema ${name} is not a directory.`);
  const { digest, files } = await contents(source);
  const bundle = selected.shadows.length ? null : await identifyBundledSchemaSource(name, source);
  const bundleSource = bundle ? { name: bundle.name, version: bundle.version, revision: bundle.revision, digest: bundle.digest } : undefined;
  return { name, source, digest, ...(bundleSource ? { bundleSource } : {}), shadows: selected.shadows, files };
}

async function snapshotPath(root: string, ref: RevisionRef): Promise<string> {
  validName(ref.name);
  if (!/^[0-9a-f]{64}$/.test(ref.digest)) throw new OpsxError("REVISION_INVALID", "Invalid revision digest.");
  const canonical = await realpath(root);
  const openspec = path.join(canonical, "openspec");
  if (await realpath(openspec) !== openspec) throw new OpsxError("REVISION_UNSAFE", "OpenSpec directory is redirected.");
  let current = openspec;
  for (const part of [".opsx", "revisions", ref.name, ref.digest]) {
    current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new OpsxError("REVISION_UNSAFE", `Revision storage contains symlink: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
}

export async function retainRevision(root: string, revision: Revision): Promise<string> {
  const target = await snapshotPath(root, revision);
  const sourceBefore = await contents(revision.source);
  if (sourceBefore.digest !== revision.digest) throw new OpsxError("REVISION_DRIFT", `Schema ${revision.name} changed before retention.`);
  try {
    const saved = await contents(target);
    if (saved.digest !== revision.digest) throw new OpsxError("REVISION_DRIFT", `Retained revision ${revision.name} is corrupt.`);
    return target;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    for (const relative of revision.files) {
      const destination = path.join(temporary, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(path.join(revision.source, relative)), { flag: "wx" });
    }
    if ((await contents(temporary)).digest !== revision.digest || (await contents(revision.source)).digest !== revision.digest) {
      throw new OpsxError("REVISION_DRIFT", `Schema ${revision.name} changed during retention.`);
    }
    await rename(temporary, target);
    return target;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function checkRevision(root: string, ref: RevisionRef, client: OpenSpecClient): Promise<RevisionCheck> {
  const saved = await snapshotPath(root, ref);
  let retained = false;
  try {
    retained = (await contents(saved)).digest === ref.digest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let revision: Revision;
  try {
    revision = await resolveRevision(client, ref.name);
  } catch (error) {
    if (error instanceof OpsxError && error.code === "OPENSPEC_FAILED") return { state: "missing", retained };
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing", retained };
    throw error;
  }
  if (revision.source !== ref.source) return { state: "shadow", revision, retained };
  if (revision.digest !== ref.digest || !retained) return { state: "drift", revision, retained };
  return { state: "intact", revision, retained };
}

export function inspectRetainedRevision(root: string, ref: RevisionRef): Promise<{ revision: RevisionRef; files: string[] }>;
export function inspectRetainedRevision(root: string, ref: RevisionRef, relative: string): Promise<{ revision: RevisionRef; file: string; content: string; bytes: number }>;
export async function inspectRetainedRevision(root: string, ref: RevisionRef, relative?: string) {
  const saved = await snapshotPath(root, ref);
  const snapshot = await contents(saved);
  if (snapshot.digest !== ref.digest) throw new OpsxError("REVISION_DRIFT", `Retained revision ${ref.name} is corrupt.`);
  if (relative === undefined) return { revision: ref, files: snapshot.files };
  if (!snapshot.files.includes(relative)) throw new OpsxError("REVISION_FILE_NOT_FOUND", `Revision ${ref.name} has no ${relative}.`);
  return { revision: ref, file: relative, ...await boundedFile(saved, relative) };
}
