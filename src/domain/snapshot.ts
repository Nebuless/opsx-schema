import { constants as fsConstants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { OpenSpecClient } from "../openspec/client.ts";
import { schemas } from "../catalog/schemas.ts";
import type { SchemaEntry } from "../catalog/schemas.ts";
import { defaultSchema, OpsxError } from "./project.ts";
import { changeHistory } from "../provenance/index.ts";
import type { ChangeHistory } from "../provenance/index.ts";
import { checkRevision, resolveRevision } from "../revisions/index.ts";
import type {
  RevisionCheck,
  Revision,
  RevisionRef,
} from "../revisions/index.ts";
import { listArchived } from "../archive/index.ts";

type Artifact = { id: string; status: string };
type ChangeList = { changes: Array<{ name: string; status: string }> };
type ChangeStatus = {
  changeName: string;
  schemaName: string;
  artifacts: Artifact[];
};
type ApplyState = {
  state: string;
  progress?: { total: number; complete: number; remaining: number };
};
type ChangeReadTask = {
  index: number;
  name: string;
  kind: "status" | "instructions";
};
type ChangeReadResult =
  | { index: number; kind: "status"; value: ChangeStatus }
  | { index: number; kind: "instructions"; value: ApplyState };

const READ_CONCURRENCY = 4;
const MAX_SPEC_ENTRIES = 2_000;
const MAX_SPEC_FILES = 2_000;
const MAX_SPEC_FILE_BYTES = 1024 * 1024;
const MAX_SPEC_TOTAL_BYTES = 16 * 1024 * 1024;
const SPEC_READ_CHUNK_BYTES = 64 * 1024;

export interface ChangeSummary {
  name: string;
  status: string;
  schema: string;
  artifacts: Artifact[];
  tasks: ApplyState["progress"] | null;
}

export interface ProjectSnapshot {
  root: string;
  defaultSchema: string;
  changes: DetailedChange[];
  archive: Array<{ name: string }>;
  schemas: SchemaEntry[];
}

export interface DetailedChange extends ChangeSummary {
  history: ChangeHistory;
  revision: {
    state: RevisionCheck["state"] | "untracked";
    name: string;
    source?: string;
    digest?: string;
    retained?: boolean;
  } | null;
}

export interface SpecificationCounts {
  specifications: number;
  requirements: number;
}

interface RequestRevisionReads {
  check(ref: RevisionRef): Promise<RevisionCheck>;
  resolve(name: string): Promise<Revision>;
}

async function mapConcurrentSettled<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const runWorker = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]!, index),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, items.length) }, () =>
      runWorker(),
    ),
  );
  return results;
}

function safeChangeName(name: string): void {
  if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
    throw new OpsxError(
      "OPENSPEC_RESPONSE",
      "OpenSpec returned an unsafe change name.",
    );
  }
}

function summarizeChange(
  name: string,
  changeStatus: string,
  status: ChangeStatus,
  apply: ApplyState,
): ChangeSummary {
  const progress =
    apply.state === "blocked" ||
    !apply.progress ||
    !Number.isInteger(apply.progress.total) ||
    !Number.isInteger(apply.progress.complete)
      ? null
      : apply.progress;
  return {
    name,
    status: changeStatus,
    schema: status.schemaName,
    artifacts: status.artifacts.map(({ id, status: artifactStatus }) => ({
      id,
      status: artifactStatus,
    })),
    tasks: progress,
  };
}

export async function changes(
  client: OpenSpecClient,
): Promise<ChangeSummary[]> {
  const list = await client.json<ChangeList>("list");
  if (!Array.isArray(list.changes))
    throw new OpsxError(
      "OPENSPEC_RESPONSE",
      "OpenSpec change list is malformed.",
    );
  const tasks: ChangeReadTask[] = [];
  for (let index = 0; index < list.changes.length; index++) {
    const item = list.changes[index]!;
    safeChangeName(item.name);
    tasks.push(
      { index, name: item.name, kind: "status" },
      { index, name: item.name, kind: "instructions" },
    );
  }
  const settled = await mapConcurrentSettled<ChangeReadTask, ChangeReadResult>(
    tasks,
    async (task) => {
      if (task.kind === "status") {
        return {
          index: task.index,
          kind: "status",
          value: await client.json<ChangeStatus>(
            "status",
            "--change",
            task.name,
          ),
        };
      }
      return {
        index: task.index,
        kind: "instructions",
        value: await client.json<ApplyState>(
          "instructions",
          "apply",
          "--change",
          task.name,
        ),
      };
    },
  );
  const facts = list.changes.map(
    (): { status?: ChangeStatus; apply?: ApplyState } => ({}),
  );
  for (const result of settled) {
    if (result.status === "rejected") throw result.reason;
    if (result.value.kind === "status")
      facts[result.value.index]!.status = result.value.value;
    else facts[result.value.index]!.apply = result.value.value;
  }
  return list.changes.map((item, index) => {
    const { status, apply } = facts[index]!;
    if (!status || !apply)
      throw new OpsxError(
        "OPENSPEC_RESPONSE",
        `OpenSpec returned incomplete status for ${item.name}.`,
      );
    return summarizeChange(item.name, item.status, status, apply);
  });
}

function revisionReadsForRequest(
  root: string,
  client: OpenSpecClient,
): RequestRevisionReads {
  const checks = new Map<string, Promise<RevisionCheck>>();
  const resolutions = new Map<string, Promise<Revision>>();
  return {
    check(ref) {
      const key = JSON.stringify([ref.name, ref.source, ref.digest]);
      let check = checks.get(key);
      if (!check) {
        check = checkRevision(root, ref, client);
        checks.set(key, check);
      }
      return check;
    },
    resolve(name) {
      let resolution = resolutions.get(name);
      if (!resolution) {
        resolution = resolveRevision(client, name);
        resolutions.set(name, resolution);
      }
      return resolution;
    },
  };
}

async function detailedChangeFromSummary(
  root: string,
  change: ChangeSummary,
  revisionReads: RequestRevisionReads,
): Promise<DetailedChange> {
  const history = await changeHistory(root, change.name);
  const known =
    history.migrations.at(-1)?.to ??
    history.retained ??
    (history.created === "Unknown" ? null : history.created);
  let revision: DetailedChange["revision"] = null;
  if (known) {
    const check = await revisionReads.check(known);
    revision = {
      state: check.state,
      name: known.name,
      source: check.revision?.source ?? known.source,
      digest: check.revision?.digest ?? known.digest,
      retained: check.retained,
    };
  } else if (history.currentSchema !== "Unknown") {
    try {
      const current: Revision = await revisionReads.resolve(
        history.currentSchema,
      );
      revision = {
        state: "untracked",
        name: current.name,
        source: current.source,
        digest: current.digest,
        retained: false,
      };
    } catch (error) {
      if (!(error instanceof OpsxError) || error.code !== "OPENSPEC_FAILED")
        throw error;
      revision = { state: "missing", name: history.currentSchema };
    }
  }
  return { ...change, history, revision };
}

export async function detailedChanges(
  root: string,
  client: OpenSpecClient,
): Promise<DetailedChange[]> {
  const active = await changes(client);
  const revisionReads = revisionReadsForRequest(root, client);
  const settled = await mapConcurrentSettled(active, (change) =>
    detailedChangeFromSummary(root, change, revisionReads),
  );
  const result: DetailedChange[] = [];
  for (const item of settled) {
    if (item.status === "rejected") throw item.reason;
    result.push(item.value);
  }
  return result;
}

/** Read one active change's provenance and revision facts without resolving other changes' details. */
export async function detailedChange(
  root: string,
  client: OpenSpecClient,
  name: string,
): Promise<DetailedChange> {
  safeChangeName(name);
  const active = await changes(client);
  const change = active.find((candidate) => candidate.name === name);
  if (!change)
    throw new OpsxError(
      "CHANGE_NOT_FOUND",
      "Active change " + name + " not found; use changes to list choices.",
    );
  return detailedChangeFromSummary(
    root,
    change,
    revisionReadsForRequest(root, client),
  );
}

async function readSpecificationRequirements(
  file: string,
  totalBytes: { value: number },
  counts: SpecificationCounts,
  buffer: Buffer,
): Promise<void> {
  const handle = await open(
    file,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile())
      throw new OpsxError(
        "SPEC_CATALOG_UNSAFE",
        `Canonical specification is not a regular file: ${file}`,
      );
    if (
      info.size > MAX_SPEC_FILE_BYTES ||
      totalBytes.value + info.size > MAX_SPEC_TOTAL_BYTES
    ) {
      throw new OpsxError(
        "SPEC_CATALOG_TOO_LARGE",
        `Canonical specification inventory exceeds its read limit at ${file}.`,
      );
    }
    totalBytes.value += info.size;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "";
    let bytesReadTotal = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      bytesReadTotal += bytesRead;
      if (bytesReadTotal > MAX_SPEC_FILE_BYTES || bytesReadTotal > info.size) {
        throw new OpsxError(
          "SPEC_CATALOG_CHANGED",
          `Canonical specification changed while being read: ${file}`,
        );
      }
      pending += decoder.decode(buffer.subarray(0, bytesRead), {
        stream: true,
      });
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        if (line.startsWith("### Requirement:")) counts.requirements++;
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    if (pending.startsWith("### Requirement:")) counts.requirements++;
    if (bytesReadTotal !== info.size)
      throw new OpsxError(
        "SPEC_CATALOG_CHANGED",
        `Canonical specification changed while being read: ${file}`,
      );
  } finally {
    await handle.close();
  }
}

export async function specificationCounts(
  root: string,
): Promise<SpecificationCounts> {
  const project = await realpath(root);
  const openSpecRoot = path.join(project, "openspec");
  const openSpecInfo = await lstat(openSpecRoot);
  if (openSpecInfo.isSymbolicLink() || !openSpecInfo.isDirectory()) {
    throw new OpsxError(
      "SPEC_CATALOG_UNSAFE",
      `OpenSpec root is not a real directory: ${openSpecRoot}`,
    );
  }
  if ((await realpath(openSpecRoot)) !== openSpecRoot)
    throw new OpsxError(
      "SPEC_CATALOG_UNSAFE",
      `OpenSpec root is redirected: ${openSpecRoot}`,
    );
  const specsRoot = path.join(openSpecRoot, "specs");
  let specsInfo: Awaited<ReturnType<typeof lstat>>;
  try {
    specsInfo = await lstat(specsRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { specifications: 0, requirements: 0 };
    throw error;
  }
  if (specsInfo.isSymbolicLink() || !specsInfo.isDirectory()) {
    throw new OpsxError(
      "SPEC_CATALOG_UNSAFE",
      `Canonical specification root is not a real directory: ${specsRoot}`,
    );
  }
  if ((await realpath(specsRoot)) !== specsRoot)
    throw new OpsxError(
      "SPEC_CATALOG_UNSAFE",
      `Canonical specification root is redirected: ${specsRoot}`,
    );
  const counts: SpecificationCounts = { specifications: 0, requirements: 0 };
  const totalBytes = { value: 0 };
  const buffer = Buffer.alloc(SPEC_READ_CHUNK_BYTES);
  let entriesSeen = 0;
  async function walk(directory: string): Promise<void> {
    if ((await realpath(directory)) !== directory)
      throw new OpsxError(
        "SPEC_CATALOG_UNSAFE",
        `Canonical specification directory is redirected: ${directory}`,
      );
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    entriesSeen += entries.length;
    if (entriesSeen > MAX_SPEC_ENTRIES)
      throw new OpsxError(
        "SPEC_CATALOG_TOO_LARGE",
        `Canonical specification inventory exceeds ${MAX_SPEC_ENTRIES} entries.`,
      );
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new OpsxError(
          "SPEC_CATALOG_UNSAFE",
          `Symlink in canonical specification inventory: ${candidate}`,
        );
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile() && entry.name === "spec.md") {
        counts.specifications++;
        if (counts.specifications > MAX_SPEC_FILES)
          throw new OpsxError(
            "SPEC_CATALOG_TOO_LARGE",
            `Canonical specification inventory exceeds ${MAX_SPEC_FILES} files.`,
          );
        await readSpecificationRequirements(
          candidate,
          totalBytes,
          counts,
          buffer,
        );
      }
    }
  }
  await walk(specsRoot);
  return counts;
}

export async function archivedNames(
  root: string,
): Promise<Array<{ name: string }>> {
  return listArchived(root);
}

export async function projectSnapshot(
  root: string,
  client: OpenSpecClient,
): Promise<ProjectSnapshot> {
  return {
    root,
    defaultSchema: await defaultSchema(root),
    changes: await detailedChanges(root, client),
    archive: await archivedNames(root),
    schemas: await schemas(client),
  };
}
