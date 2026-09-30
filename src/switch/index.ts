import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  acquireProjectMutationLock,
  PROJECT_LOCK_FILE,
} from "../project-lock.ts";
import {
  listBundledSchemas,
  prepareBundledSchema,
  installBundledSchema,
} from "../bundled/index.ts";
import type { BundledSchemaPlan } from "../bundled/index.ts";
import { OpenSpecClient } from "../openspec/client.ts";
import { defaultSchema, OpsxError, resolveProject } from "../domain/project.ts";
import { changes } from "../domain/snapshot.ts";
import type { ChangeSummary } from "../domain/snapshot.ts";
import { changeDirectory } from "../archive/index.ts";
import {
  checkRevision,
  resolveRevision,
  retainRevision,
  inspectRetainedRevision,
} from "../revisions/index.ts";
import type { Revision, RevisionRef } from "../revisions/index.ts";
import {
  changeHistory,
  readProvenance,
  revisionRef,
} from "../provenance/index.ts";
import type {
  ChangeHistory,
  ChangeSelectionAssociation,
  Provenance,
} from "../provenance/index.ts";
import { previewSchemaHandoff } from "../cli/handoff.ts";
import type { SchemaHandoffPreview } from "../cli/handoff.ts";
import { validateChangeAgainst } from "../validation/index.ts";
import type { ValidationResult } from "../validation/index.ts";
import {
  assertSkillBundleDeclared,
  loadAgentProfileDigest,
  loadAgentProfiles,
  loadSkillBundles,
  parseSkillsManifest,
  previewSkillInstall,
  applySkillInstall,
  discoverSkillInstallHosts,
  isSkillInstallHostId,
} from "../resources/index.ts";
import type {
  AgentProfile,
  ResourceRuntimeOptions,
  SkillBundle,
  SkillInstallHostDescriptor,
  SkillInstallHostId,
  SkillInstallPlan,
  SkillInstallTarget,
} from "../resources/index.ts";

const JOURNAL_VERSION = 1;
const JOURNAL_NAME = "switch-journal.json";
const SELECTION_RECEIPT_NAME = "selection-receipt.json";
const MAX_GUARDED_FILE_BYTES = 1024 * 1024;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface SwitchRequest {
  schema: string;
  profiles: string[];
  migrations: string[];
  skillHosts?: SkillInstallHostId[];
  skillBundle?: SkillBundle;
}

export type ProjectSelectionReceipt = ChangeSelectionAssociation;

export interface SwitchDiagnostic {
  code: string;
  message: string;
  severity?: "error" | "warning";
  change?: string;
  target?: string;
}

export interface ActiveSwitchChange {
  name: string;
  schema: string;
  status: string;
  pinned: boolean;
  inherited: boolean;
}

export interface LegacyPinPreview {
  change: string;
  from: RevisionRef | null;
  target: string;
  selectedMigration: boolean;
  retained: boolean;
}

export interface SwitchMigrationPreview {
  change: string;
  from: RevisionRef | null;
  to: RevisionRef | null;
  inherited: boolean;
  createdUnder: RevisionRef | "Unknown";
  retainCurrentRevision: boolean;
  noOp: boolean;
  validation: ValidationResult | null;
  ready: boolean;
}

export interface SwitchPreview {
  version: 1;
  root: string;
  request: SwitchRequest;
  token: string;
  freshness: { status: "current"; digest: string };
  canApply: boolean;
  noOp: boolean;
  default: { current: string; target: string };
  schema: { status: string; destination: string; digest: string | null };
  profiles: {
    targets: SkillInstallTarget[];
    sharedTargets: Array<{ target: string; profiles: string[] }>;
  };
  skillHosts: SkillInstallHostDescriptor[];
  selectionReceipt: {
    destination: string;
    action: "write" | "unchanged" | "unavailable";
    receipt: ProjectSelectionReceipt | null;
  };
  activeChanges: ActiveSwitchChange[];
  migrations: SwitchMigrationPreview[];
  legacyPins: LegacyPinPreview[];
  diagnostics: SwitchDiagnostic[];
}

export type SwitchBoundary =
  | "schema.install"
  | "schema.validate"
  | "skills.install"
  | "revision.retain"
  | "legacy.provenance"
  | "legacy.pin"
  | "migration.pin"
  | "migration.provenance"
  | "selection.receipt"
  | "config.activate"
  | "postflight";

export interface SwitchRuntimeOptions extends ResourceRuntimeOptions {
  /** Test seam for deterministic interruption at durable transaction boundaries. */
  afterBoundary?: (boundary: SwitchBoundary) => void | Promise<void>;
}

export interface SwitchJournalAction {
  id: string;
  kind: string;
  status: "pending" | "running" | "complete" | "failed";
  targets: string[];
  intent: string;
  expected?: unknown;
  desiredDigest?: string;
  desiredBytes?: string;
  observed?: Record<string, { digest: string | null; bytes?: string }>;
  error?: { code: string; message: string };
}

export interface SwitchJournal {
  version: 1;
  id: string;
  state: "applying" | "partial" | "complete";
  startedAt: string;
  updatedAt: string;
  root: string;
  request: SwitchRequest;
  previewToken: string;
  oldDefault: string;
  targetDefault: string;
  actions: SwitchJournalAction[];
  error?: { code: string; message: string };
}

export interface SwitchRecovery {
  status: "none" | "complete" | "partial";
  journal?: SwitchJournal;
  lock?: { path: string; holder: string | null };
  observedDefault?: string;
  writes: Array<{
    action: string;
    target: string;
    state: string;
    actualDigest?: string;
    expectedDigest?: string;
  }>;
  nextActions: string[];
}

export interface SwitchApplyResult {
  status: "applied" | "unchanged" | "partial";
  journal: SwitchJournal | null;
  recovery: SwitchRecovery;
}

interface FileSnapshot {
  exists: boolean;
  bytes?: string;
  digest: string | null;
  size: number;
  dev: string | null;
  ino: string | null;
  mode: number | null;
  mtimeNs: string | null;
  ctimeNs: string | null;
}

interface FileWrite {
  target: string;
  intent: string;
  boundary: SwitchBoundary;
  before: FileSnapshot;
  after: string;
}

interface RetentionWrite {
  ref: RevisionRef;
  revision: Revision;
}

interface InternalPlan {
  preview: SwitchPreview;
  client: OpenSpecClient;
  bundlePlan: BundledSchemaPlan | null;
  skillPlan: SkillInstallPlan | null;
  targetRevision: RevisionRef | null;
  active: Array<{
    summary: ChangeSummary;
    history: ChangeHistory;
    metadata: FileSnapshot;
    provenance: FileSnapshot;
    directory: string;
  }>;
  migrations: Array<{
    name: string;
    handoff: SchemaHandoffPreview;
    freshness: string | null;
    validation: ValidationResult;
    fromRevision: Revision | null;
    inherited: boolean;
    retainCurrent: boolean;
    ready: boolean;
    history: ChangeHistory;
  }>;
  retentions: RetentionWrite[];
  fileWrites: FileWrite[];
  configBefore: FileSnapshot;
  configAfter: string | null;
  selectionReceiptBefore: FileSnapshot;
  selectionReceipt: ProjectSelectionReceipt | null;
  selectionReceiptWrite: FileWrite | null;
  selectionManifestDigests:
    | ChangeSelectionAssociation["manifestDigests"]
    | null;
  resourceOptions: ResourceRuntimeOptions;
}

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const canonicalJson = (value: unknown): string => JSON.stringify(value);

function sameRevisionRef(a: RevisionRef, b: RevisionRef): boolean {
  if (a.name !== b.name || a.source !== b.source || a.digest !== b.digest)
    return false;
  const aBundle = (a as RevisionRef & { bundleSource?: unknown }).bundleSource;
  const bBundle = (b as RevisionRef & { bundleSource?: unknown }).bundleSource;
  return (
    aBundle === undefined ||
    bBundle === undefined ||
    canonicalJson(aBundle) === canonicalJson(bBundle)
  );
}

function sameExactRevisionRef(a: RevisionRef, b: RevisionRef): boolean {
  return (
    sameRevisionRef(a, b) &&
    (a.bundleSource === undefined) === (b.bundleSource === undefined)
  );
}

async function revisionFromDirectory(
  name: string,
  source: string,
  installedSource: string,
): Promise<Revision> {
  const files: string[] = [];
  const contents = new Map<string, Buffer>();
  const hash = createHash("sha256");
  async function walk(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(source, absolute);
      const info = await lstat(absolute, { bigint: true });
      if (info.isSymbolicLink())
        throw new OpsxError(
          "REVISION_UNSAFE",
          "Symlink in destination schema: " + relative,
        );
      if (info.isDirectory()) await walk(absolute);
      else if (
        info.isFile() &&
        !["README.md", "AGENTS.md"].includes(entry.name)
      ) {
        const bytes = await readFile(absolute);
        const after = await lstat(absolute, { bigint: true });
        if (
          info.dev !== after.dev ||
          info.ino !== after.ino ||
          info.size !== after.size ||
          info.mtimeNs !== after.mtimeNs ||
          info.ctimeNs !== after.ctimeNs
        ) {
          throw new OpsxError(
            "SWITCH_STALE",
            "Destination schema changed while it was fingerprinted: " +
              relative,
          );
        }
        files.push(relative);
        contents.set(relative, bytes);
      } else if (!info.isFile())
        throw new OpsxError(
          "REVISION_UNSAFE",
          "Unsupported schema entry: " + relative,
        );
    }
  }
  await walk(source);
  files.sort();
  if (!files.includes("schema.yaml"))
    throw new OpsxError(
      "REVISION_INVALID",
      "Schema at " + source + " has no schema.yaml.",
    );
  for (const relative of files) {
    const bytes = contents.get(relative)!;
    hash
      .update(relative)
      .update("\0")
      .update(String(bytes.length))
      .update("\0")
      .update(bytes);
  }
  return {
    name,
    source: installedSource,
    digest: hash.digest("hex"),
    files,
    shadows: [],
  };
}

function diagnostic(
  code: string,
  message: string,
  extras: Partial<SwitchDiagnostic> = {},
): SwitchDiagnostic {
  return { code, message, severity: "error", ...extras };
}

function validateRequest(request: SwitchRequest): SwitchRequest {
  if (
    !request ||
    typeof request !== "object" ||
    !SAFE_NAME.test(request.schema)
  ) {
    throw new OpsxError(
      "SWITCH_REQUEST",
      "A safe destination schema name is required.",
    );
  }
  for (const [field, values] of [
    ["profiles", request.profiles],
    ["migrations", request.migrations],
  ] as const) {
    if (
      !Array.isArray(values) ||
      values.some(
        (value) => typeof value !== "string" || !SAFE_NAME.test(value),
      )
    ) {
      throw new OpsxError(
        "SWITCH_REQUEST",
        `Switch ${field} must contain safe names.`,
      );
    }
    if (new Set(values).size !== values.length)
      throw new OpsxError(
        "SWITCH_REQUEST",
        `Switch ${field} contains duplicates.`,
      );
  }
  if (request.skillHosts !== undefined) {
    if (
      !Array.isArray(request.skillHosts) ||
      request.skillHosts.some((host) => !isSkillInstallHostId(host))
    ) {
      throw new OpsxError(
        "SWITCH_REQUEST",
        "Switch skillHosts must contain supported host ids.",
      );
    }
    if (new Set(request.skillHosts).size !== request.skillHosts.length) {
      throw new OpsxError(
        "SWITCH_REQUEST",
        "Switch skillHosts contains duplicates.",
      );
    }
  }
  if (
    request.skillBundle !== undefined &&
    !isSkillBundle(request.skillBundle)
  ) {
    throw new OpsxError(
      "SWITCH_REQUEST",
      "Switch skillBundle must be default, recommended, or all.",
    );
  }
  return {
    schema: request.schema,
    profiles: [...request.profiles].sort(),
    migrations: [...request.migrations].sort(),
    ...(request.skillHosts === undefined
      ? {}
      : { skillHosts: [...request.skillHosts].sort() }),
    skillBundle: request.skillBundle ?? "default",
  };
}

function isSkillBundle(value: unknown): value is SkillBundle {
  return value === "default" || value === "recommended" || value === "all";
}

function isRevisionRef(value: unknown): value is RevisionRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  if (
    typeof ref.name !== "string" ||
    !SAFE_NAME.test(ref.name) ||
    typeof ref.source !== "string" ||
    !path.isAbsolute(ref.source) ||
    typeof ref.digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(ref.digest)
  )
    return false;
  if (ref.bundleSource === undefined) return true;
  const source = ref.bundleSource;
  if (!source || typeof source !== "object" || Array.isArray(source))
    return false;
  const bundleSource = source as Record<string, unknown>;
  return (
    typeof bundleSource.name === "string" &&
    SAFE_NAME.test(bundleSource.name) &&
    typeof bundleSource.version === "string" &&
    bundleSource.version.length > 0 &&
    typeof bundleSource.revision === "string" &&
    bundleSource.revision.length > 0 &&
    typeof bundleSource.digest === "string" &&
    /^[0-9a-f]{64}$/.test(bundleSource.digest)
  );
}

function isProjectSelectionReceipt(
  value: unknown,
): value is ProjectSelectionReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  const exactKeys = [
    "version",
    "effectiveRevision",
    "profiles",
    "skillHosts",
    "skillBundle",
    "manifestDigests",
  ];
  if (
    Object.keys(receipt).sort().join(" ") !== exactKeys.sort().join(" ") ||
    receipt.version !== 1 ||
    !isRevisionRef(receipt.effectiveRevision) ||
    !isSkillBundle(receipt.skillBundle)
  )
    return false;
  if (
    !Array.isArray(receipt.profiles) ||
    receipt.profiles.some(
      (id) => typeof id !== "string" || !SAFE_NAME.test(id),
    ) ||
    new Set(receipt.profiles).size !== receipt.profiles.length
  )
    return false;
  if (
    !Array.isArray(receipt.skillHosts) ||
    receipt.skillHosts.some((host) => !isSkillInstallHostId(host)) ||
    new Set(receipt.skillHosts).size !== receipt.skillHosts.length
  )
    return false;
  const digests = receipt.manifestDigests;
  if (!digests || typeof digests !== "object" || Array.isArray(digests))
    return false;
  const manifestDigests = digests as Record<string, unknown>;
  const digestKeys = ["agentProfiles", "schemaSkills", "skillBundles"];
  return (
    Object.keys(manifestDigests).sort().join(" ") ===
      digestKeys.sort().join(" ") &&
    typeof manifestDigests.agentProfiles === "string" &&
    /^[0-9a-f]{64}$/.test(manifestDigests.agentProfiles) &&
    typeof manifestDigests.schemaSkills === "string" &&
    /^[0-9a-f]{64}$/.test(manifestDigests.schemaSkills) &&
    (manifestDigests.skillBundles === null ||
      (typeof manifestDigests.skillBundles === "string" &&
        /^[0-9a-f]{64}$/.test(manifestDigests.skillBundles)))
  );
}

function selectionReceiptPath(root: string): string {
  return path.join(root, "openspec", ".opsx", SELECTION_RECEIPT_NAME);
}

async function selectionReceiptSnapshot(root: string): Promise<FileSnapshot> {
  const target = selectionReceiptPath(root);
  try {
    await safeParent(root, target);
  } catch (error) {
    if (errorCode(error, "") !== "SWITCH_PARENT_MISSING") throw error;
  }
  return fileSnapshot(target);
}

function parseSelectionReceiptSnapshot(
  snapshot: FileSnapshot,
  target: string,
): ProjectSelectionReceipt | null {
  if (!snapshot.exists) return null;
  try {
    const value = JSON.parse(
      Buffer.from(snapshot.bytes!, "base64").toString("utf8"),
    ) as unknown;
    if (!isProjectSelectionReceipt(value)) throw new Error("invalid receipt");
    return {
      version: 1,
      effectiveRevision: JSON.parse(
        JSON.stringify(value.effectiveRevision),
      ) as RevisionRef,
      profiles: [...value.profiles],
      skillHosts: [...value.skillHosts],
      skillBundle: value.skillBundle,
      manifestDigests: { ...value.manifestDigests },
    };
  } catch {
    throw new OpsxError(
      "SWITCH_SELECTION_RECEIPT_INVALID",
      "Project skill-selection receipt is invalid: " + target,
    );
  }
}

export async function readSelectionReceipt(
  rootInput: string,
): Promise<ProjectSelectionReceipt | null> {
  const root = await resolveProject(rootInput, true);
  const target = selectionReceiptPath(root);
  return parseSelectionReceiptSnapshot(
    await selectionReceiptSnapshot(root),
    target,
  );
}

async function fileSnapshot(target: string): Promise<FileSnapshot> {
  let info;
  try {
    info = await lstat(target, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        exists: false,
        digest: null,
        size: 0,
        dev: null,
        ino: null,
        mode: null,
        mtimeNs: null,
        ctimeNs: null,
      };
    }
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink())
    throw new OpsxError(
      "SWITCH_UNSAFE_FILE",
      `Guarded target is not a regular file: ${target}`,
    );
  if (info.size > BigInt(MAX_GUARDED_FILE_BYTES))
    throw new OpsxError(
      "SWITCH_FILE_TOO_LARGE",
      `Guarded file exceeds ${MAX_GUARDED_FILE_BYTES} bytes: ${target}`,
    );
  const bytes = await readFile(target);
  const after = await lstat(target, { bigint: true });
  if (
    info.dev !== after.dev ||
    info.ino !== after.ino ||
    info.size !== after.size ||
    info.mtimeNs !== after.mtimeNs ||
    info.ctimeNs !== after.ctimeNs
  ) {
    throw new OpsxError(
      "SWITCH_STALE",
      `File changed while it was being read: ${target}`,
    );
  }
  return {
    exists: true,
    bytes: bytes.toString("base64"),
    digest: sha256(bytes),
    size: bytes.byteLength,
    dev: info.dev.toString(),
    ino: info.ino.toString(),
    mode: Number(info.mode & 0o777n),
    mtimeNs: info.mtimeNs.toString(),
    ctimeNs: info.ctimeNs.toString(),
  };
}

function sameSnapshot(
  a: FileSnapshot,
  b: FileSnapshot,
  identity = true,
): boolean {
  if (a.exists !== b.exists || a.digest !== b.digest || a.size !== b.size)
    return false;
  if (!identity || !a.exists) return true;
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.mode === b.mode &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs
  );
}

async function safeParent(root: string, target: string): Promise<void> {
  const relative = path.relative(root, target);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new OpsxError(
      "SWITCH_UNSAFE_PATH",
      `Write target escapes project: ${target}`,
    );
  const parts = path.dirname(relative).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new OpsxError(
          "SWITCH_PARENT_MISSING",
          `Write parent does not exist: ${current}`,
        );
      throw error;
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new OpsxError(
        "SWITCH_UNSAFE_PATH",
        `Write parent is not a real directory: ${current}`,
      );
  }
}

function snapshotBrief(snapshot: FileSnapshot): Record<string, unknown> {
  return {
    exists: snapshot.exists,
    digest: snapshot.digest,
    size: snapshot.size,
    dev: snapshot.dev,
    ino: snapshot.ino,
    mode: snapshot.mode,
    mtimeNs: snapshot.mtimeNs,
    ctimeNs: snapshot.ctimeNs,
  };
}

function makeFileAction(kind: string, write: FileWrite): SwitchJournalAction {
  const action = makeAction(
    kind,
    write.intent,
    [write.target],
    { ...snapshotBrief(write.before), bytes: write.before.bytes },
    sha256(write.after),
  );
  action.desiredBytes = Buffer.from(write.after, "utf8").toString("base64");
  return action;
}

function yamlWithSchema(
  raw: string,
  schemaName: string,
  label: string,
): string {
  const document = YAML.parseDocument(raw, { uniqueKeys: true });
  if (document.errors.length)
    throw new OpsxError(
      "SWITCH_YAML_INVALID",
      `${label} is invalid YAML: ${document.errors[0]?.message ?? "parse error"}`,
    );
  const value = document.toJS();
  if (value != null && (typeof value !== "object" || Array.isArray(value)))
    throw new OpsxError(
      "SWITCH_YAML_INVALID",
      `${label} must be a YAML mapping.`,
    );
  document.set("schema", schemaName);
  return document.toString();
}

function parseProvenanceSnapshot(
  snapshot: FileSnapshot,
  label: string,
): Provenance | null {
  if (!snapshot.exists) return null;
  try {
    const value = JSON.parse(
      Buffer.from(snapshot.bytes!, "base64").toString("utf8"),
    ) as Provenance;
    if (
      !value ||
      value.version !== 1 ||
      (value.created !== null &&
        (!value.created || typeof value.created.name !== "string")) ||
      !Array.isArray(value.migrations)
    ) {
      throw new Error("invalid shape");
    }
    return value;
  } catch {
    throw new OpsxError(
      "PROVENANCE_INVALID",
      `Invalid provenance at ${label}.`,
    );
  }
}

function provenanceBytes(
  previous: Provenance | null,
  retained: RevisionRef | null,
  migration?: { from: RevisionRef; to: RevisionRef; at: string },
  replacementAssociation?: ChangeSelectionAssociation,
): string {
  const created = previous?.created ?? null;
  const migrations = [...(previous?.migrations ?? [])];
  if (
    retained &&
    previous?.retained &&
    !sameRevisionRef(previous.retained, retained)
  ) {
    throw new OpsxError(
      "PROVENANCE_STALE",
      "Existing retained revision differs from the current effective schema.",
    );
  }
  if (migration) {
    const prior = migrations.at(-1)?.to ?? previous?.retained ?? created;
    if (prior && !sameRevisionRef(prior, migration.from))
      throw new OpsxError(
        "PROVENANCE_STALE",
        "Migration history does not match the current schema pin.",
      );
    migrations.push(migration);
  }
  let association = previous?.association;
  if (migration && previous?.association) {
    if (
      !replacementAssociation ||
      !isProjectSelectionReceipt(replacementAssociation) ||
      !sameExactRevisionRef(
        replacementAssociation.effectiveRevision,
        migration.to,
      )
    ) {
      throw new OpsxError(
        "MIGRATION_SELECTION_UNVERIFIED",
        "An associated change needs a verified target selection for its migrated schema revision.",
      );
    }
    association = replacementAssociation;
  } else if (replacementAssociation !== undefined) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_MISMATCH",
      "A migration cannot invent a selection association for an unassociated change.",
    );
  }
  const next: Provenance = {
    version: 1,
    created,
    migrations,
    ...((retained ?? previous?.retained)
      ? { retained: retained ?? previous!.retained }
      : {}),
    ...(association ? { association } : {}),
  };
  return `${JSON.stringify(next, null, 2)}\n`;
}

async function makeWrite(
  root: string,
  target: string,
  after: string,
  intent: string,
  boundary: SwitchBoundary,
): Promise<FileWrite> {
  await safeParent(root, target);
  const before = await fileSnapshot(target);
  return { target, intent, boundary, before, after };
}

type HandoffResult = Awaited<ReturnType<typeof previewSchemaHandoff>>;

async function previewSwitchHandoff(
  root: string,
  entry: InternalPlan["active"][number],
  target: RevisionRef,
  targetSchemaRoot: string | null,
  client: OpenSpecClient,
  schemaName: string,
  destinationIsUninstalledBundle: boolean,
): Promise<HandoffResult> {
  const hasSelectionAssociation = Boolean(
    parseProvenanceSnapshot(
      entry.provenance,
      path.join(entry.directory, ".opsx-provenance.json"),
    )?.association,
  );
  if (
    !targetSchemaRoot ||
    (!destinationIsUninstalledBundle && !hasSelectionAssociation)
  ) {
    return previewSchemaHandoff(root, entry.summary.name, schemaName);
  }
  const source = await resolveRevision(client, entry.history.currentSchema);
  if (source.shadows.length)
    throw new OpsxError(
      "SCHEMA_AMBIGUOUS",
      "Current schema has same-name shadows.",
    );
  let from: RevisionRef = revisionRef(source);
  const recorded =
    entry.history.migrations.at(-1)?.to ??
    entry.history.retained ??
    (entry.history.created === "Unknown" ? null : entry.history.created);
  let retainCurrentRevision = true;
  if (recorded) {
    if (!sameRevisionRef(recorded, from))
      throw new OpsxError(
        "REVISION_DIVERGED",
        "Recorded current schema revision differs from the live schema.",
      );
    const check = await checkRevision(root, recorded, client);
    if (!check.revision || check.state !== "intact")
      throw new OpsxError(
        "REVISION_" + check.state.toUpperCase(),
        "Current schema revision is " + check.state + "; handoff is blocked.",
      );
    from = recorded;
    retainCurrentRevision = !check.retained;
  }
  const validation = await validateChangeAgainst(
    root,
    entry.summary.name,
    schemaName,
    { targetSchemaRoot },
  );
  const data: SchemaHandoffPreview = {
    ready: validation.ok,
    change: entry.summary.name,
    from,
    to: target,
    inherited: entry.history.inherited,
    noOp: false,
    createdUnder: entry.history.created,
    retainCurrentRevision,
    validation,
  };
  const freshness = sha256(
    canonicalJson({
      change: entry.summary.name,
      history: entry.history,
      from,
      target,
      validation,
    }),
  );
  return {
    ok: true,
    phase: "preview",
    data,
    confirmation: { freshness },
  } as HandoffResult;
}

async function installPlan(
  rootInput: string,
  requestInput: SwitchRequest,
  options: SwitchRuntimeOptions,
): Promise<InternalPlan> {
  const request = validateRequest(requestInput);
  const root = await resolveProject(rootInput, true);
  const selectionReceiptBefore = await selectionReceiptSnapshot(root);
  const priorSelectionReceipt = parseSelectionReceiptSnapshot(
    selectionReceiptBefore,
    selectionReceiptPath(root),
  );
  const client = new OpenSpecClient(root);
  await client.ensureSupported();
  const currentDefault = await defaultSchema(root);
  const configPath = path.join(root, "openspec", "config.yaml");
  const configBefore = await fileSnapshot(configPath);
  if (!configBefore.exists)
    throw new OpsxError(
      "PROJECT_CONFIG",
      "OpenSpec project config disappeared during switch preview.",
    );
  const configText = Buffer.from(configBefore.bytes!, "base64").toString(
    "utf8",
  );
  const configAfter =
    currentDefault === request.schema
      ? null
      : yamlWithSchema(configText, request.schema, "openspec/config.yaml");

  const diagnostics: SwitchDiagnostic[] = [];
  let skillHostDescriptors = [
    ...(await discoverSkillInstallHosts(root, options)),
  ];
  let bundlePlan: BundledSchemaPlan | null = null;
  let targetRevision: RevisionRef | null = null;
  let targetSchemaRevision: Revision | null = null;
  let targetSchemaRoot: string | null = null;
  let targetStatus = "intact";
  let targetDigest: string | null = null;
  let targetDestination = "";
  if (listBundledSchemas().includes(request.schema)) {
    try {
      bundlePlan = await prepareBundledSchema(root, request.schema);
      targetStatus = bundlePlan.status;
      targetDestination = bundlePlan.destination;
      targetDigest = bundlePlan.digest;
      targetSchemaRoot = bundlePlan.sourceDirectory;
      if (bundlePlan.status === "missing")
        targetSchemaRevision = await revisionFromDirectory(
          request.schema,
          bundlePlan.sourceDirectory,
          bundlePlan.destination,
        );
      else if (bundlePlan.status === "intact")
        targetSchemaRevision = await resolveRevision(client, request.schema);
      if (targetSchemaRevision) {
        const revision = revisionRef(targetSchemaRevision);
        targetRevision =
          bundlePlan.status === "missing"
            ? {
                ...revision,
                bundleSource: {
                  name: bundlePlan.sourceName,
                  version: bundlePlan.sourceVersion,
                  revision: bundlePlan.sourceRevision,
                  digest: bundlePlan.sourceDigest,
                },
              }
            : revision;
      }
      if (bundlePlan.status === "collision")
        diagnostics.push(
          diagnostic(
            "SCHEMA_COLLISION",
            bundlePlan.reason ??
              `Destination schema path conflicts: ${bundlePlan.destination}`,
            { target: bundlePlan.destination },
          ),
        );
    } catch (error) {
      diagnostics.push(
        diagnostic(
          errorCode(error, "SCHEMA_PREVIEW_FAILED"),
          errorMessage(error),
        ),
      );
    }
  } else {
    try {
      const revision = await resolveRevision(client, request.schema);
      targetSchemaRevision = revision;
      targetRevision = revisionRef(revision);
      targetSchemaRoot = revision.source;
      targetStatus = "intact";
      targetDigest = revision.digest;
      targetDestination = revision.source;
      if (revision.shadows.length > 0)
        diagnostics.push(
          diagnostic(
            "SCHEMA_SHADOW",
            `Schema ${request.schema} has shadowed resolutions; resolve the collision before switching.`,
          ),
        );
    } catch (error) {
      diagnostics.push(
        diagnostic(errorCode(error, "SCHEMA_UNAVAILABLE"), errorMessage(error)),
      );
    }
  }

  if (
    targetRevision &&
    (bundlePlan === null || bundlePlan.status === "intact")
  ) {
    try {
      await client.command("schema", "validate", request.schema);
    } catch (error) {
      diagnostics.push(diagnostic("SCHEMA_INVALID", errorMessage(error)));
    }
  }

  const summaries = await changes(client);
  const active = await Promise.all(
    summaries.map(async (summary) => {
      const history = await changeHistory(root, summary.name);
      const directory = await changeDirectory(root, summary.name);
      const metadata = await fileSnapshot(
        path.join(directory, ".openspec.yaml"),
      );
      const provenance = await fileSnapshot(
        path.join(directory, ".opsx-provenance.json"),
      );
      return { summary, history, metadata, provenance, directory };
    }),
  );
  const activeMap = new Map(active.map((entry) => [entry.summary.name, entry]));
  const activeChanges: ActiveSwitchChange[] = active.map((entry) => ({
    name: entry.summary.name,
    schema: entry.history.currentSchema,
    status: entry.summary.status,
    pinned: !entry.history.inherited,
    inherited: entry.history.inherited,
  }));

  const migrations: InternalPlan["migrations"] = [];
  for (const name of request.migrations) {
    const entry = activeMap.get(name);
    if (!entry) {
      diagnostics.push(
        diagnostic(
          "CHANGE_NOT_ACTIVE",
          `Selected change is not active: ${name}`,
          { change: name },
        ),
      );
      continue;
    }
    if (!targetRevision) {
      diagnostics.push(
        diagnostic(
          "MIGRATION_TARGET_UNAVAILABLE",
          `Cannot validate ${name}; destination schema is unavailable.`,
          { change: name },
        ),
      );
      continue;
    }
    if (entry.history.divergence) {
      diagnostics.push(
        diagnostic("CHANGE_PROVENANCE_DIVERGED", entry.history.divergence, {
          change: name,
        }),
      );
      continue;
    }
    try {
      const result = await previewSwitchHandoff(
        root,
        entry,
        targetRevision,
        targetSchemaRoot,
        client,
        request.schema,
        bundlePlan?.status === "missing",
      );
      if (!result.ok || result.phase !== "preview" || !result.data) {
        diagnostics.push(
          diagnostic(
            result.ok ? "MIGRATION_PREVIEW_INVALID" : result.error.code,
            result.ok
              ? `No schema handoff preview for ${name}.`
              : result.error.message,
            { change: name },
          ),
        );
        continue;
      }
      const handoff = result.data;
      const validation = handoff.validation;
      const identityMatches =
        handoff.to.name === targetRevision.name &&
        handoff.to.digest === targetRevision.digest;
      const ready =
        handoff.ready && (handoff.noOp || validation.ok) && identityMatches;
      if (!identityMatches)
        diagnostics.push(
          diagnostic(
            "MIGRATION_TARGET_IDENTITY",
            `The validated revision for ${name} does not match the concrete target ${request.schema}.`,
            { change: name },
          ),
        );
      if (!validation.ok && !handoff.noOp) {
        for (const finding of validation.findings.filter(
          (item) => item.severity === "error",
        )) {
          diagnostics.push(
            diagnostic(finding.code, finding.message, {
              change: name,
              ...(finding.path ? { target: finding.path } : {}),
            }),
          );
        }
        diagnostics.push(
          diagnostic(
            "MIGRATION_INCOMPATIBLE",
            `Change ${name} does not validate against ${request.schema}.`,
            { change: name },
          ),
        );
      }
      if (!ready && !diagnostics.some((item) => item.change === name))
        diagnostics.push(
          diagnostic(
            "MIGRATION_NOT_READY",
            `Change ${name} is not ready for schema handoff.`,
            { change: name },
          ),
        );
      let fromRevision: Revision | null = null;
      if (handoff.retainCurrentRevision || entry.history.inherited) {
        try {
          fromRevision = await resolveRevision(client, handoff.from.name);
        } catch (error) {
          diagnostics.push(
            diagnostic("MIGRATION_SOURCE_UNAVAILABLE", errorMessage(error), {
              change: name,
            }),
          );
        }
        if (fromRevision && fromRevision.digest !== handoff.from.digest) {
          diagnostics.push(
            diagnostic(
              "MIGRATION_SOURCE_DRIFT",
              `Current schema ${handoff.from.name} changed after its revision was captured.`,
              { change: name },
            ),
          );
          fromRevision = null;
        }
      }
      migrations.push({
        name,
        handoff,
        freshness: result.confirmation?.freshness ?? null,
        validation,
        fromRevision,
        inherited: entry.history.inherited,
        retainCurrent: handoff.retainCurrentRevision || entry.history.inherited,
        ready,
        history: entry.history,
      });
    } catch (error) {
      diagnostics.push(
        diagnostic(
          errorCode(error, "MIGRATION_PREVIEW_FAILED"),
          errorMessage(error),
          { change: name },
        ),
      );
    }
  }

  const selected = new Set(request.migrations);
  const legacyPins: LegacyPinPreview[] = [];
  const legacyRevisions = new Map<string, Revision>();
  if (currentDefault !== request.schema) {
    for (const entry of active) {
      if (!entry.history.inherited) continue;
      let revision: Revision | null = null;
      try {
        revision = await resolveRevision(client, currentDefault);
        if (revision.shadows.length > 0)
          throw new OpsxError(
            "SCHEMA_SHADOW",
            `Current schema ${currentDefault} is shadowed.`,
          );
        legacyRevisions.set(entry.summary.name, revision);
      } catch (error) {
        diagnostics.push(
          diagnostic(
            "LEGACY_SCHEMA_UNAVAILABLE",
            `Cannot preserve effective schema ${currentDefault} for ${entry.summary.name}: ${errorMessage(error)}`,
            { change: entry.summary.name },
          ),
        );
      }
      legacyPins.push({
        change: entry.summary.name,
        from: revision
          ? {
              name: revision.name,
              source: revision.source,
              digest: revision.digest,
            }
          : null,
        target: selected.has(entry.summary.name)
          ? request.schema
          : currentDefault,
        selectedMigration: selected.has(entry.summary.name),
        retained: Boolean(entry.history.retained),
      });
    }
  }

  const selectedProfileIds = request.profiles;
  const selectedSkillHosts = request.skillHosts ?? [];
  let selectedProfiles: AgentProfile[] = [];
  let skillPlan: SkillInstallPlan | null = null;
  let selectionManifestDigests:
    | ChangeSelectionAssociation["manifestDigests"]
    | null = null;
  let selectionCanBeRecorded = false;
  if (!targetSchemaRoot) {
    diagnostics.push(
      diagnostic(
        "RESOURCE_SCHEMA_UNAVAILABLE",
        "Cannot resolve the destination schema skill manifest.",
      ),
    );
  } else {
    try {
      assertSkillBundleDeclared(
        await loadSkillBundles(targetSchemaRoot),
        request.schema,
        request.skillBundle!,
      );
      const allProfiles = await loadAgentProfiles(options.profileManifestPath);
      const byId = new Map(allProfiles.map((profile) => [profile.id, profile]));
      selectedProfiles = selectedProfileIds
        .map((id) => byId.get(id))
        .filter((item): item is AgentProfile => Boolean(item));
      const missingProfiles = selectedProfileIds.filter((id) => !byId.has(id));
      for (const id of missingProfiles)
        diagnostics.push(
          diagnostic("PROFILE_NOT_FOUND", "Unknown agent profile: " + id),
        );
      let declaredSkills: ReturnType<typeof parseSkillsManifest> = [];
      try {
        declaredSkills = parseSkillsManifest(
          await readFile(path.join(targetSchemaRoot, "skills.txt"), "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        selectedProfileIds.length === 0 &&
        selectedSkillHosts.length === 0 &&
        declaredSkills.length > 0
      ) {
        diagnostics.push(
          diagnostic(
            "RESOURCE_SELECTION_REQUIRED",
            "This schema declares managed skills; select at least one named profile or native skill host.",
          ),
        );
      }
      if (selectedProfileIds.length === 0 && selectedSkillHosts.length === 0) {
        const catalog = await loadSkillBundles(targetSchemaRoot);
        selectionManifestDigests = {
          agentProfiles: await loadAgentProfileDigest(
            options.profileManifestPath,
          ),
          schemaSkills: catalog.manifestDigests.skills,
          skillBundles: catalog.manifestDigests.profiles,
        };
        selectionCanBeRecorded = declaredSkills.length === 0;
      } else if (
        missingProfiles.length === 0 ||
        selectedSkillHosts.length > 0
      ) {
        const requiredTargets = await requiredSkillTargets(
          client,
          active,
          migrations,
          selectedProfiles,
          request.schema,
          targetSchemaRoot,
        );
        skillPlan = await previewSkillInstall(
          {
            projectRoot: root,
            schemaRoot: targetSchemaRoot,
            schemaName: request.schema,
            profiles:
              missingProfiles.length === 0
                ? selectedProfileIds
                : selectedProfiles.map((profile) => profile.id),
            skillHosts: selectedSkillHosts,
            skillBundle: request.skillBundle,
            requiredTargets,
          },
          {
            sourceRoots: options.sourceRoots,
            profileManifestPath: options.profileManifestPath,
          },
        );
        selectionManifestDigests = { ...skillPlan.manifestDigests };
        selectionCanBeRecorded = missingProfiles.length === 0;
        skillHostDescriptors = [...skillPlan.skillHosts];
        for (const item of skillPlan.diagnostics)
          diagnostics.push(
            diagnostic(item.code, item.message, { target: item.target }),
          );
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          errorCode(error, "RESOURCE_PREVIEW_FAILED"),
          errorMessage(error),
        ),
      );
    }
  }
  const selectedHostDescriptors = skillHostDescriptors.filter((host) =>
    selectedSkillHosts.includes(host.host),
  );
  for (const host of selectedHostDescriptors) {
    if (host.action === "refuse") {
      diagnostics.push(
        diagnostic(
          "SKILL_HOST_OBSTRUCTED",
          host.reason ?? `Selected skill host is unsafe: ${host.label}`,
          { target: host.destination ?? undefined },
        ),
      );
    }
  }

  const selectionReceipt: ProjectSelectionReceipt | null =
    targetRevision && selectionManifestDigests && selectionCanBeRecorded
      ? {
          version: 1,
          effectiveRevision: JSON.parse(
            JSON.stringify(targetRevision),
          ) as RevisionRef,
          profiles: [...request.profiles],
          skillHosts: [...selectedSkillHosts],
          skillBundle: request.skillBundle!,
          manifestDigests: { ...selectionManifestDigests },
        }
      : null;
  const selectionReceiptWrite: FileWrite | null =
    selectionReceipt &&
    canonicalJson(selectionReceipt) !== canonicalJson(priorSelectionReceipt)
      ? {
          target: selectionReceiptPath(root),
          intent:
            "Record explicit skill selection for " +
            selectionReceipt.effectiveRevision.name +
            "@" +
            selectionReceipt.effectiveRevision.digest,
          boundary: "selection.receipt",
          before: selectionReceiptBefore,
          after: JSON.stringify(selectionReceipt, null, 2) + "\n",
        }
      : null;

  const migrationAssociations = new Map<string, ChangeSelectionAssociation>();
  for (const migration of migrations) {
    if (migration.handoff.noOp) continue;
    const entry = activeMap.get(migration.name)!;
    const priorAssociation = parseProvenanceSnapshot(
      entry.provenance,
      path.join(entry.directory, ".opsx-provenance.json"),
    )?.association;
    if (!priorAssociation) continue;
    if (
      !selectionReceipt ||
      !selectionCanBeRecorded ||
      !isProjectSelectionReceipt(selectionReceipt) ||
      !targetRevision ||
      !sameExactRevisionRef(
        selectionReceipt.effectiveRevision,
        targetRevision,
      ) ||
      (skillPlan !== null && !skillPlan.canApply)
    ) {
      diagnostics.push(
        diagnostic(
          "MIGRATION_SELECTION_UNVERIFIED",
          "Cannot migrate associated change " +
            migration.name +
            " without a verified selection for " +
            request.schema +
            ".",
          { change: migration.name },
        ),
      );
      continue;
    }
    migrationAssociations.set(migration.name, selectionReceipt);
  }

  const retentions: RetentionWrite[] = [];
  const needed = new Map<string, Revision>();
  if (
    migrations.some((item) => item.ready && !item.handoff.noOp) &&
    targetSchemaRevision
  ) {
    needed.set(
      targetSchemaRevision.name + ":" + targetSchemaRevision.digest,
      targetSchemaRevision,
    );
  }
  for (const revision of legacyRevisions.values())
    needed.set(`${revision.name}:${revision.digest}`, revision);
  for (const migration of migrations)
    if (migration.retainCurrent && migration.fromRevision) {
      needed.set(
        `${migration.fromRevision.name}:${migration.fromRevision.digest}`,
        migration.fromRevision,
      );
    }
  for (const [key, revision] of needed) {
    try {
      await inspectRetainedRevision(root, revision);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        retentions.push({
          ref: {
            name: revision.name,
            source: revision.source,
            digest: revision.digest,
          },
          revision,
        });
      else
        diagnostics.push(
          diagnostic(
            errorCode(error, "REVISION_RETENTION_CONFLICT"),
            errorMessage(error),
            { target: key },
          ),
        );
    }
  }

  const fileWrites: FileWrite[] = [];
  const migrationByName = new Map(migrations.map((item) => [item.name, item]));
  for (const pin of legacyPins) {
    const entry = activeMap.get(pin.change)!;
    const current = pin.from;
    if (!current) continue;
    const migration = migrationByName.get(pin.change);
    const provenance = parseProvenanceSnapshot(
      entry.provenance,
      path.join(entry.directory, ".opsx-provenance.json"),
    );
    if (migration) {
      if (provenance?.association && !migrationAssociations.has(pin.change))
        continue;
      const retained = migration.retainCurrent ? current : null;
      const sidecar = provenanceBytes(
        provenance,
        retained,
        {
          from: migration.handoff.from,
          to: targetRevision!,
          at: new Date(0).toISOString(),
        },
        migrationAssociations.get(pin.change),
      );
      // The stable timestamp is replaced during Apply; it is excluded from the preview token.
      const pinPath = path.join(entry.directory, ".openspec.yaml");
      const pinRaw = entry.metadata.exists
        ? Buffer.from(entry.metadata.bytes!, "base64").toString("utf8")
        : "";
      const nextPin = yamlWithSchema(
        pinRaw,
        request.schema,
        `${pin.change}/.openspec.yaml`,
      );
      fileWrites.push(
        await makeWrite(
          root,
          pinPath,
          nextPin,
          `Migrate ${pin.change} to ${request.schema}`,
          "migration.pin",
        ),
      );
      fileWrites.push(
        await makeWrite(
          root,
          path.join(entry.directory, ".opsx-provenance.json"),
          sidecar,
          `Record selected migration for ${pin.change}`,
          "migration.provenance",
        ),
      );
    } else {
      const sidecar = provenanceBytes(provenance, current);
      fileWrites.push(
        await makeWrite(
          root,
          path.join(entry.directory, ".opsx-provenance.json"),
          sidecar,
          `Retain legacy schema for ${pin.change}`,
          "legacy.provenance",
        ),
      );
      const pinPath = path.join(entry.directory, ".openspec.yaml");
      const pinRaw = entry.metadata.exists
        ? Buffer.from(entry.metadata.bytes!, "base64").toString("utf8")
        : "";
      const nextPin = yamlWithSchema(
        pinRaw,
        currentDefault,
        `${pin.change}/.openspec.yaml`,
      );
      fileWrites.push(
        await makeWrite(
          root,
          pinPath,
          nextPin,
          `Pin ${pin.change} to its previous effective schema`,
          "legacy.pin",
        ),
      );
    }
  }

  for (const migration of migrations) {
    if (migration.handoff.noOp || !migration.ready) continue;
    if (legacyPins.some((pin) => pin.change === migration.name)) continue;
    const entry = activeMap.get(migration.name)!;
    const provenance = parseProvenanceSnapshot(
      entry.provenance,
      path.join(entry.directory, ".opsx-provenance.json"),
    );
    const from = migration.handoff.from;
    const to = targetRevision!;
    if (provenance?.association && !migrationAssociations.has(migration.name))
      continue;
    const sidecar = provenanceBytes(
      provenance,
      migration.retainCurrent ? from : null,
      { from, to, at: new Date(0).toISOString() },
      migrationAssociations.get(migration.name),
    );
    const pinPath = path.join(entry.directory, ".openspec.yaml");
    const pinRaw = entry.metadata.exists
      ? Buffer.from(entry.metadata.bytes!, "base64").toString("utf8")
      : "";
    fileWrites.push(
      await makeWrite(
        root,
        pinPath,
        yamlWithSchema(
          pinRaw,
          request.schema,
          `${migration.name}/.openspec.yaml`,
        ),
        `Migrate ${migration.name} to ${request.schema}`,
        "migration.pin",
      ),
    );
    fileWrites.push(
      await makeWrite(
        root,
        path.join(entry.directory, ".opsx-provenance.json"),
        sidecar,
        `Record selected migration for ${migration.name}`,
        "migration.provenance",
      ),
    );
  }

  const selectedHostBlocked = selectedHostDescriptors.some(
    (host) =>
      host.action === "refuse" ||
      host.targets.some((target) => target.action === "refuse"),
  );
  const canApply =
    diagnostics.every((item) => item.severity !== "error") &&
    targetRevision !== null &&
    targetStatus !== "collision" &&
    (!skillPlan || skillPlan.canApply) &&
    !selectedHostBlocked &&
    migrations.every((item) => item.ready) &&
    legacyPins.every((item) => item.from !== null);
  const skillTargets = skillPlan ? [...skillPlan.targets] : [];
  const sharedTargets = skillTargets
    .filter((target) => target.sharedProfiles.length > 1)
    .map((target) => ({
      target: target.relativeTarget,
      profiles: [...target.sharedProfiles],
    }));
  const resourceTargetsNoop =
    skillTargets.every((target) => target.action === "noop") &&
    selectedHostDescriptors.every(
      (host) =>
        host.action !== "refuse" &&
        host.targets.every((target) => target.action === "noop"),
    );
  const noOp =
    targetStatus === "intact" &&
    configAfter === null &&
    resourceTargetsNoop &&
    migrations.every((item) => item.handoff.noOp) &&
    legacyPins.length === 0 &&
    retentions.length === 0 &&
    fileWrites.length === 0 &&
    selectionReceiptWrite === null;
  const freshnessPayload = {
    root,
    request,
    currentDefault,
    configBefore: snapshotBrief(configBefore),
    selectionReceipt: {
      before: snapshotBrief(selectionReceiptBefore),
      current: priorSelectionReceipt,
      target: selectionReceipt,
      writeDigest: selectionReceiptWrite
        ? sha256(selectionReceiptWrite.after)
        : null,
    },
    active: active.map((entry) => ({
      name: entry.summary.name,
      status: entry.summary.status,
      schema: entry.history.currentSchema,
      inherited: entry.history.inherited,
      metadata: snapshotBrief(entry.metadata),
      provenance: snapshotBrief(entry.provenance),
      divergence: entry.history.divergence,
    })),
    schema: {
      status: targetStatus,
      destination: targetDestination,
      digest: targetDigest,
      source: targetSchemaRoot,
    },
    bundle: bundlePlan
      ? {
          status: bundlePlan.status,
          destination: bundlePlan.destination,
          digest: bundlePlan.digest,
          targetDigest: bundlePlan.targetDigest,
        }
      : null,
    skills: skillPlan
      ? {
          inputDigest: skillPlan.inputDigest,
          freshness: skillPlan.freshness.digest,
          targets: skillPlan.targets,
          hosts: skillPlan.skillHosts,
        }
      : { profiles: request.profiles },
    skillHosts: skillHostDescriptors,
    migrations: migrations.map((item) => ({
      name: item.name,
      from: item.handoff.from,
      to: targetRevision,
      inherited: item.inherited,
      ready: item.handoff.ready,
      noOp: item.handoff.noOp,
      retainCurrent: item.retainCurrent,
      freshness: item.freshness,
      validation: item.validation,
    })),
    legacyPins,
    diagnostics,
  };
  const token = sha256(canonicalJson(freshnessPayload));
  const preview: SwitchPreview = {
    version: 1,
    root,
    request,
    token,
    freshness: { status: "current", digest: token },
    canApply,
    noOp,
    default: { current: currentDefault, target: request.schema },
    schema: {
      status: targetStatus,
      destination: targetDestination,
      digest: targetDigest,
    },
    profiles: { targets: skillTargets, sharedTargets },
    skillHosts: skillHostDescriptors,
    selectionReceipt: {
      destination: selectionReceiptPath(root),
      action: !selectionReceipt
        ? "unavailable"
        : selectionReceiptWrite
          ? "write"
          : "unchanged",
      receipt: selectionReceipt,
    },
    activeChanges,
    migrations: migrations.map((item) => ({
      change: item.name,
      from: item.handoff.from,
      to: targetRevision,
      inherited: item.inherited,
      createdUnder: item.history.created,
      retainCurrentRevision: item.retainCurrent,
      noOp: item.handoff.noOp,
      validation: item.validation,
      ready: item.ready,
    })),
    legacyPins,
    diagnostics,
  };
  return {
    preview,
    client,
    bundlePlan,
    skillPlan,
    targetRevision,
    active,
    migrations,
    retentions,
    fileWrites,
    configBefore,
    configAfter,
    selectionReceiptBefore,
    selectionReceipt,
    selectionReceiptWrite,
    selectionManifestDigests,
    resourceOptions: {
      sourceRoots: options.sourceRoots,
      profileManifestPath: options.profileManifestPath,
    },
  };
}

async function requiredSkillTargets(
  client: OpenSpecClient,
  active: InternalPlan["active"],
  migrations: InternalPlan["migrations"],
  profiles: readonly AgentProfile[],
  targetSchema: string,
  targetSchemaRoot: string,
): Promise<string[]> {
  const rootsBySchema = new Map<string, string>();
  for (const entry of active)
    rootsBySchema.set(entry.history.currentSchema, "");
  for (const item of migrations)
    if (item.ready) rootsBySchema.set(targetSchema, targetSchemaRoot);
  rootsBySchema.set(targetSchema, targetSchemaRoot);
  const declarations = new Map<string, string[]>();
  for (const [name, knownRoot] of rootsBySchema) {
    let root = knownRoot;
    if (!root) {
      try {
        root = (await resolveRevision(client, name)).source;
      } catch {
        continue;
      }
    }
    try {
      const manifest = await readFile(path.join(root, "skills.txt"), "utf8");
      declarations.set(
        name,
        parseSkillsManifest(manifest).map((item) =>
          path.posix.basename(item.path),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      declarations.set(name, []);
    }
  }
  const required = new Set<string>();
  for (const profile of profiles)
    for (const skill of declarations.values()) {
      for (const name of skill)
        required.add(path.posix.join(profile.target, name));
    }
  return [...required].sort();
}

function errorCode(error: unknown, fallback: string): string {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function preview(
  root: string,
  request: SwitchRequest,
  options: SwitchRuntimeOptions = {},
): Promise<SwitchPreview> {
  return (await installPlan(root, request, options)).preview;
}

function journalPath(root: string): string {
  return path.join(root, "openspec", ".opsx", JOURNAL_NAME);
}
function lockPath(root: string): string {
  return path.join(root, "openspec", PROJECT_LOCK_FILE);
}
function resourceOwnershipPath(root: string): string {
  return path.join(root, ".openspec", "opsx-schema", "managed-resources.json");
}

async function readJournal(root: string): Promise<SwitchJournal | null> {
  const target = journalPath(root);
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink())
    throw new OpsxError(
      "SWITCH_JOURNAL_UNSAFE",
      `Switch journal path is unsafe: ${target}`,
    );
  try {
    const value = JSON.parse(await readFile(target, "utf8")) as SwitchJournal;
    if (
      !value ||
      value.version !== JOURNAL_VERSION ||
      typeof value.id !== "string" ||
      !Array.isArray(value.actions) ||
      !["applying", "partial", "complete"].includes(value.state)
    ) {
      throw new Error("invalid journal");
    }
    return value;
  } catch {
    throw new OpsxError(
      "SWITCH_JOURNAL_INVALID",
      `Switch recovery journal is invalid: ${target}`,
    );
  }
}

async function writeJournal(
  root: string,
  journal: SwitchJournal,
): Promise<void> {
  const directory = path.dirname(journalPath(root));
  try {
    const info = await lstat(path.join(root, "openspec", ".opsx"));
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new OpsxError(
        "SWITCH_JOURNAL_UNSAFE",
        "OpenSpec .opsx storage is not a real directory.",
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path.join(root, "openspec", ".opsx"), { mode: 0o700 });
  }
  try {
    await mkdir(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const parent = await lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink())
    throw new OpsxError(
      "SWITCH_JOURNAL_UNSAFE",
      `Journal directory is unsafe: ${directory}`,
    );
  const file = journalPath(root);
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(
    temp,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const current = await lstat(file);
    if (current.isSymbolicLink() || !current.isFile())
      throw new OpsxError(
        "SWITCH_JOURNAL_UNSAFE",
        `Switch journal target is not a regular file: ${file}`,
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await rename(temp, file);
  const dirHandle = await open(directory, fsConstants.O_RDONLY);
  try {
    await dirHandle.sync();
  } finally {
    await dirHandle.close();
  }
}

async function acquireProjectLock(root: string): Promise<() => Promise<void>> {
  const openspecDirectory = path.join(root, "openspec");
  const openspecInfo = await lstat(openspecDirectory);
  if (!openspecInfo.isDirectory() || openspecInfo.isSymbolicLink())
    throw new OpsxError(
      "SWITCH_UNSAFE_PATH",
      `OpenSpec directory is not a real directory: ${openspecDirectory}`,
    );
  const target = lockPath(root);
  const handle = await open(
    target,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    0o600,
  ).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new OpsxError(
        "SWITCH_LOCKED",
        `Another schema switch holds ${target}; inspect recovery before retrying.`,
      );
    throw error;
  });
  const holder = JSON.stringify({
    pid: process.pid,
    id: randomUUID(),
    startedAt: new Date().toISOString(),
  });
  try {
    await handle.writeFile(holder, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(target).catch(() => undefined);
    throw error;
  }
  await handle.close();
  return async () => {
    try {
      const current = await readFile(target, "utf8");
      if (current === holder) await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}

async function applyFileWrite(
  root: string,
  write: FileWrite,
): Promise<FileSnapshot> {
  await safeParent(root, write.target);
  const actual = await fileSnapshot(write.target);
  if (!sameSnapshot(write.before, actual))
    throw new OpsxError(
      "SWITCH_STALE",
      `Guarded file changed after preview: ${write.target}`,
    );
  const bytes = Buffer.from(write.after, "utf8");
  const temp = `${write.target}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(
    temp,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    write.before.mode ?? 0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const immediatelyBefore = await fileSnapshot(write.target);
    if (!sameSnapshot(write.before, immediatelyBefore))
      throw new OpsxError(
        "SWITCH_STALE",
        `Guarded file changed before replacement: ${write.target}`,
      );
    if (write.before.exists) {
      await rename(temp, write.target);
    } else {
      try {
        await link(temp, write.target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new OpsxError(
            "SWITCH_STALE",
            `Guarded file appeared before creation: ${write.target}`,
          );
        throw error;
      }
      await unlink(temp);
    }
    const parentHandle = await open(
      path.dirname(write.target),
      fsConstants.O_RDONLY,
    );
    try {
      await parentHandle.sync();
    } finally {
      await parentHandle.close();
    }
  } finally {
    await rm(temp, { force: true });
  }
  const result = await fileSnapshot(write.target);
  if (!result.exists || result.digest !== sha256(bytes))
    throw new OpsxError(
      "SWITCH_WRITE_VERIFY",
      `Guarded write did not persist: ${write.target}`,
    );
  return result;
}

async function treeDigest(directory: string): Promise<string | null> {
  let rootInfo;
  try {
    rootInfo = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return null;
  const hash = createHash("sha256");
  hash.update(`root\0${rootInfo.mode & 0o777}\0`);
  const walk = async (current: string, relative: string): Promise<void> => {
    const names = (await readdir(current)).sort((a, b) => a.localeCompare(b));
    for (const name of names) {
      const child = path.join(current, name);
      const childRelative = relative ? `${relative}/${name}` : name;
      const info = await lstat(child);
      if (info.isSymbolicLink())
        throw new OpsxError(
          "SWITCH_UNSAFE_TARGET",
          `Recovery target contains a symlink: ${child}`,
        );
      if (info.isDirectory()) {
        hash.update(`dir\0${childRelative}\0${info.mode & 0o777}\0`);
        await walk(child, childRelative);
      } else if (info.isFile()) {
        const bytes = await readFile(child);
        hash.update(
          `file\0${childRelative}\0${info.mode & 0o777}\0${bytes.byteLength}\0`,
        );
        hash.update(bytes);
      } else
        throw new OpsxError(
          "SWITCH_UNSAFE_TARGET",
          `Recovery target contains an unsupported entry: ${child}`,
        );
    }
  };
  await walk(directory, "");
  return hash.digest("hex");
}

function makeAction(
  kind: string,
  intent: string,
  targets: string[],
  expected?: unknown,
  desiredDigest?: string,
): SwitchJournalAction {
  return {
    id: randomUUID(),
    kind,
    status: "pending",
    targets,
    intent,
    ...(expected === undefined ? {} : { expected }),
    ...(desiredDigest ? { desiredDigest } : {}),
  };
}

function skillPlanTargets(plan: SkillInstallPlan) {
  return [...plan.targets, ...plan.skillHosts.flatMap((host) => host.targets)];
}

async function buildJournal(
  plan: InternalPlan,
  token: string,
): Promise<SwitchJournal> {
  const { preview: view } = plan;
  const actions: SwitchJournalAction[] = [];
  if (plan.bundlePlan?.status === "missing")
    actions.push(
      makeAction(
        "schema.install",
        `Install schema ${view.request.schema}`,
        [plan.bundlePlan.destination],
        {
          name: view.request.schema,
          status: "missing",
          digest: plan.bundlePlan.digest,
        },
        plan.bundlePlan.digest,
      ),
    );
  if (plan.targetRevision)
    actions.push(
      makeAction(
        "schema.validate",
        `Validate schema ${view.request.schema} before activation`,
        [view.schema.destination],
        { name: view.request.schema, digest: view.schema.digest },
      ),
    );
  if (
    plan.skillPlan &&
    skillPlanTargets(plan.skillPlan).some(
      (target) => target.action === "install",
    )
  ) {
    const installTargets = skillPlanTargets(plan.skillPlan).filter(
      (target) => target.action === "install",
    );
    const ownership = await fileSnapshot(resourceOwnershipPath(view.root));
    const hostLabels = view.skillHosts
      .filter((host) => view.request.skillHosts?.includes(host.host))
      .map((host) => host.label);
    const intent = [
      view.request.profiles.length > 0 ? "selected agent profiles" : null,
      hostLabels.length > 0
        ? `selected skill hosts (${hostLabels.join(", ")})`
        : null,
    ]
      .filter((item): item is string => item !== null)
      .join(" and ");
    actions.push(
      makeAction(
        "skills.install",
        `Install required skills for ${intent}`,
        [
          ...installTargets.map((target) => target.absoluteTarget),
          resourceOwnershipPath(view.root),
        ],
        {
          inputDigest: plan.skillPlan.inputDigest,
          targets: installTargets.map((target) => ({
            target: target.absoluteTarget,
            sourceDigest: target.sourceDigest,
            ...("host" in target ? { host: target.host } : {}),
          })),
          ownership: { ...snapshotBrief(ownership), bytes: ownership.bytes },
        },
      ),
    );
  }
  for (const item of plan.retentions)
    actions.push(
      makeAction(
        "revision.retain",
        `Retain ${item.ref.name}@${item.ref.digest}`,
        [
          path.join(
            view.root,
            "openspec",
            ".opsx",
            "revisions",
            item.ref.name,
            item.ref.digest,
          ),
        ],
        {
          name: item.ref.name,
          source: item.ref.source,
          digest: item.ref.digest,
        },
        item.ref.digest,
      ),
    );
  const migrationActionsAdded = new Set<string>();
  for (const pin of view.legacyPins) {
    const entry = plan.active.find((item) => item.summary.name === pin.change)!;
    const migration = plan.migrations.find((item) => item.name === pin.change);
    const provenancePath = path.join(entry.directory, ".opsx-provenance.json");
    const provenanceWrite = plan.fileWrites.find(
      (write) => write.target === provenancePath,
    );
    if (provenanceWrite)
      actions.push(
        makeFileAction(
          migration ? "migration.provenance" : "legacy.provenance",
          provenanceWrite,
        ),
      );
    const pinPath = path.join(entry.directory, ".openspec.yaml");
    const pinWrite = plan.fileWrites.find((write) => write.target === pinPath);
    if (pinWrite)
      actions.push(
        makeFileAction(migration ? "migration.pin" : "legacy.pin", pinWrite),
      );
    if (migration) migrationActionsAdded.add(migration.name);
  }
  for (const migration of plan.migrations) {
    if (migration.handoff.noOp || migrationActionsAdded.has(migration.name))
      continue;
    const entry = plan.active.find(
      (item) => item.summary.name === migration.name,
    )!;
    for (const boundary of ["migration.pin", "migration.provenance"] as const) {
      const write = plan.fileWrites.find(
        (candidate) =>
          candidate.boundary === boundary &&
          candidate.target.startsWith(entry.directory + path.sep),
      );
      if (write) actions.push(makeFileAction(boundary, write));
    }
  }
  if (plan.configAfter !== null) {
    const configWrite: FileWrite = {
      target: path.join(view.root, "openspec", "config.yaml"),
      intent: `Activate project default ${view.request.schema}`,
      boundary: "config.activate",
      before: plan.configBefore,
      after: plan.configAfter,
    };
    actions.push(makeFileAction("config.activate", configWrite));
  }
  if (plan.selectionReceiptWrite)
    actions.push(
      makeFileAction("selection.receipt", plan.selectionReceiptWrite),
    );
  actions.push(
    makeAction(
      "postflight",
      "Verify active default, schema, receipt and required skill targets",
      [
        path.join(view.root, "openspec", "config.yaml"),
        view.schema.destination,
        selectionReceiptPath(view.root),
      ],
    ),
  );
  const now = new Date().toISOString();
  return {
    version: 1,
    id: randomUUID(),
    state: "applying",
    startedAt: now,
    updatedAt: now,
    root: view.root,
    request: view.request,
    previewToken: token,
    oldDefault: view.default.current,
    targetDefault: view.default.target,
    actions,
  };
}

function updateAction(
  journal: SwitchJournal,
  id: string,
  status: SwitchJournalAction["status"],
  error?: unknown,
): void {
  const action = journal.actions.find((item) => item.id === id);
  if (!action) throw new Error(`Unknown journal action: ${id}`);
  action.status = status;
  if (error)
    action.error = {
      code: errorCode(error, "SWITCH_FAILED"),
      message: errorMessage(error),
    };
  journal.updatedAt = new Date().toISOString();
}

async function runBoundary(
  options: SwitchRuntimeOptions,
  boundary: SwitchBoundary,
): Promise<void> {
  await options.afterBoundary?.(boundary);
}

async function captureSkillTargets(
  root: string,
  action: SwitchJournalAction,
): Promise<void> {
  const observations: NonNullable<SwitchJournalAction["observed"]> = {};
  for (const target of action.targets) {
    try {
      if (target === resourceOwnershipPath(root)) {
        const snapshot = await fileSnapshot(target);
        observations[target] = {
          digest: snapshot.digest,
          ...(snapshot.bytes ? { bytes: snapshot.bytes } : {}),
        };
      } else observations[target] = { digest: await treeDigest(target) };
    } catch {
      observations[target] = { digest: null };
    }
  }
  action.observed = observations;
}

async function verifyBeforeActivation(plan: InternalPlan): Promise<void> {
  const { root, request, schema } = plan.preview;
  const configNow = await fileSnapshot(
    path.join(root, "openspec", "config.yaml"),
  );
  if (!sameSnapshot(plan.configBefore, configNow))
    throw new OpsxError(
      "SWITCH_STALE",
      "Project config changed while schema resources were being prepared.",
    );
  const receiptNow = await selectionReceiptSnapshot(root);
  if (!sameSnapshot(plan.selectionReceiptBefore, receiptNow))
    throw new OpsxError(
      "SWITCH_STALE",
      "Project skill-selection receipt changed while schema resources were being prepared.",
    );
  if (plan.bundlePlan) {
    const fresh = await prepareBundledSchema(root, request.schema);
    if (
      fresh.status !== "intact" ||
      fresh.digest !== schema.digest ||
      fresh.destination !== schema.destination
    ) {
      throw new OpsxError(
        "SWITCH_INCOMPLETE_INSTALL",
        `Destination schema is not fully installed at ${schema.destination}.`,
      );
    }
  }
  if (plan.skillPlan) {
    const freshPlan = await previewSkillInstall(
      plan.skillPlan.request,
      plan.resourceOptions,
    );
    if (!freshPlan.canApply)
      throw new OpsxError(
        "SWITCH_INCOMPLETE_INSTALL",
        "Selected skill targets became conflicting before default activation.",
      );
    if (
      canonicalJson(freshPlan.manifestDigests) !==
      canonicalJson(plan.skillPlan.manifestDigests)
    ) {
      throw new OpsxError(
        "SWITCH_STALE",
        "Skill-selection manifests changed before default activation.",
      );
    }
    const targetKey = (target: ReturnType<typeof skillPlanTargets>[number]) =>
      `${"host" in target ? `host:${target.host}` : "profile"}:${target.relativeTarget}`;
    const expectedTargets = skillPlanTargets(plan.skillPlan);
    const expected = new Map(
      expectedTargets.map((target) => [targetKey(target), target]),
    );
    const freshTargets = skillPlanTargets(freshPlan);
    if (freshTargets.length !== expectedTargets.length)
      throw new OpsxError(
        "SWITCH_STALE",
        "Selected skill targets changed before default activation.",
      );
    for (const target of freshTargets) {
      const reviewedTarget = expected.get(targetKey(target));
      if (
        !reviewedTarget ||
        reviewedTarget.sourceDigest !== target.sourceDigest
      )
        throw new OpsxError(
          "SWITCH_STALE",
          `Skill source or target changed before activation: ${target.relativeTarget}`,
        );
      if (
        !reviewedTarget ||
        reviewedTarget.action === "refuse" ||
        target.action === "refuse"
      )
        throw new OpsxError(
          "SWITCH_INCOMPLETE_INSTALL",
          `Skill target is not ready: ${target.absoluteTarget}`,
        );
      if (
        target.state !== "owned" ||
        target.installedDigest !== target.sourceDigest
      )
        throw new OpsxError(
          "SWITCH_INCOMPLETE_INSTALL",
          `Required skill target is not installed exactly: ${target.absoluteTarget}`,
        );
    }
  }
  for (const item of plan.migrations) {
    if (item.handoff.noOp) continue;
    const validation = await validateChangeAgainst(
      root,
      item.name,
      request.schema,
    );
    if (!validation.ok)
      throw new OpsxError(
        "SWITCH_MIGRATION_CHANGED",
        `Selected change ${item.name} no longer validates against ${request.schema}.`,
      );
  }
}

async function executePlan(
  plan: InternalPlan,
  journal: SwitchJournal,
  options: SwitchRuntimeOptions,
): Promise<void> {
  const { root } = plan.preview;
  const execAction = async (
    kind: string,
    boundary: SwitchBoundary,
    fn: () => Promise<void>,
  ) => {
    const action = journal.actions.find(
      (item) => item.kind === kind && item.status === "pending",
    );
    if (!action) return;
    updateAction(journal, action.id, "running");
    await writeJournal(root, journal);
    try {
      await fn();
      if (kind === "skills.install") {
        await captureSkillTargets(root, action);
        await writeJournal(root, journal);
      }
      await runBoundary(options, boundary);
      updateAction(journal, action.id, "complete");
      await writeJournal(root, journal);
    } catch (error) {
      if (kind === "skills.install") {
        try {
          await captureSkillTargets(root, action);
          await writeJournal(root, journal);
        } catch {
          /* Preserve the primary failure in the transaction journal. */
        }
      }
      updateAction(journal, action.id, "failed", error);
      journal.error = {
        code: errorCode(error, "SWITCH_FAILED"),
        message: errorMessage(error),
      };
      await writeJournal(root, journal);
      throw error;
    }
  };

  if (plan.bundlePlan?.status === "missing") {
    await execAction("schema.install", "schema.install", async () => {
      await installBundledSchema(
        root,
        plan.preview.request.schema,
        plan.bundlePlan!,
      );
    });
  }
  if (plan.targetRevision) {
    await execAction("schema.validate", "schema.validate", async () => {
      await plan.client.command(
        "schema",
        "validate",
        plan.preview.request.schema,
      );
    });
  }
  for (const item of plan.migrations) {
    if (item.handoff.noOp) continue;
    const validation = await validateChangeAgainst(
      root,
      item.name,
      plan.preview.request.schema,
    );
    if (!validation.ok)
      throw new OpsxError(
        "SWITCH_MIGRATION_CHANGED",
        `Selected change ${item.name} no longer validates against ${plan.preview.request.schema}.`,
      );
  }
  if (
    plan.skillPlan &&
    skillPlanTargets(plan.skillPlan).some(
      (target) => target.action === "install",
    )
  ) {
    await execAction("skills.install", "skills.install", async () => {
      const resourceResult = await applySkillInstall(
        plan.skillPlan!,
        plan.resourceOptions,
      );
      const reviewed = new Map(
        skillPlanTargets(plan.skillPlan!).map((target) => [
          target.relativeTarget,
          target,
        ]),
      );
      const reported = new Set([
        ...resourceResult.installedTargets,
        ...resourceResult.unchangedTargets,
      ]);
      const unexpected = [...reported].find((target) => !reviewed.has(target));
      if (unexpected)
        throw new OpsxError(
          "SWITCH_UNREVIEWED_TARGET",
          `Resource install reported an unreviewed target: ${unexpected}`,
        );
      for (const [target, planned] of reviewed) {
        if (
          planned.action === "install" &&
          !resourceResult.installedTargets.includes(target)
        ) {
          throw new OpsxError(
            "SWITCH_INCOMPLETE_INSTALL",
            `Resource install did not confirm the reviewed target: ${target}`,
          );
        }
        if (
          planned.action === "noop" &&
          !resourceResult.unchangedTargets.includes(target)
        ) {
          throw new OpsxError(
            "SWITCH_INCOMPLETE_INSTALL",
            `Resource install did not confirm the unchanged target: ${target}`,
          );
        }
      }
    });
  }
  for (const retention of plan.retentions) {
    const target = path.join(
      root,
      "openspec",
      ".opsx",
      "revisions",
      retention.ref.name,
      retention.ref.digest,
    );
    await execAction("revision.retain", "revision.retain", async () => {
      const actual = await retainRevision(root, retention.revision);
      if (actual !== target)
        throw new OpsxError(
          "SWITCH_RETENTION_FAILED",
          `Retained revision landed at an unexpected path: ${actual}`,
        );
    });
  }
  for (const boundary of [
    "legacy.provenance",
    "legacy.pin",
    "migration.pin",
    "migration.provenance",
  ] as const) {
    const kind = boundary;
    const matching = plan.fileWrites.filter(
      (item) => item.boundary === boundary,
    );
    for (const write of matching) {
      const action = journal.actions.find(
        (item) =>
          item.kind === kind &&
          item.targets.includes(write.target) &&
          item.status === "pending",
      );
      if (!action) continue;
      updateAction(journal, action.id, "running");
      await writeJournal(root, journal);
      try {
        let after = write.after;
        if (boundary === "migration.provenance")
          after = after.replaceAll(
            new Date(0).toISOString(),
            new Date().toISOString(),
          );
        action.desiredDigest = sha256(after);
        action.desiredBytes = Buffer.from(after, "utf8").toString("base64");
        await writeJournal(root, journal);
        const actual = await fileSnapshot(write.target);
        if (!sameSnapshot(write.before, actual))
          throw new OpsxError(
            "SWITCH_STALE",
            `Guarded file changed before ${boundary}: ${write.target}`,
          );
        await applyFileWrite(root, { ...write, after });
        await runBoundary(options, boundary);
        updateAction(journal, action.id, "complete");
        await writeJournal(root, journal);
      } catch (error) {
        updateAction(journal, action.id, "failed", error);
        journal.error = {
          code: errorCode(error, "SWITCH_FAILED"),
          message: errorMessage(error),
        };
        await writeJournal(root, journal);
        throw error;
      }
    }
  }

  if (plan.configAfter !== null) {
    await verifyBeforeActivation(plan);
    const action = journal.actions.find(
      (item) => item.kind === "config.activate" && item.status === "pending",
    );
    if (!action)
      throw new OpsxError(
        "SWITCH_JOURNAL_INVALID",
        "Config activation is missing from the transaction journal.",
      );
    updateAction(journal, action.id, "running");
    await writeJournal(root, journal);
    try {
      const configPath = path.join(root, "openspec", "config.yaml");
      const actual = await fileSnapshot(configPath);
      if (!sameSnapshot(plan.configBefore, actual))
        throw new OpsxError(
          "SWITCH_STALE",
          "Project config changed before default activation.",
        );
      action.desiredDigest = sha256(plan.configAfter);
      action.desiredBytes = Buffer.from(plan.configAfter, "utf8").toString(
        "base64",
      );
      await writeJournal(root, journal);
      await applyFileWrite(root, {
        target: configPath,
        intent: action.intent,
        boundary: "config.activate",
        before: plan.configBefore,
        after: plan.configAfter,
      });
      await runBoundary(options, "config.activate");
      updateAction(journal, action.id, "complete");
      await writeJournal(root, journal);
    } catch (error) {
      updateAction(journal, action.id, "failed", error);
      journal.error = {
        code: errorCode(error, "SWITCH_FAILED"),
        message: errorMessage(error),
      };
      await writeJournal(root, journal);
      throw error;
    }
  }

  if (plan.selectionReceiptWrite) {
    const action = journal.actions.find(
      (item) => item.kind === "selection.receipt" && item.status === "pending",
    );
    if (!action)
      throw new OpsxError(
        "SWITCH_JOURNAL_INVALID",
        "Selection-receipt write is missing from the transaction journal.",
      );
    updateAction(journal, action.id, "running");
    await writeJournal(root, journal);
    try {
      const write = plan.selectionReceiptWrite;
      if (action.desiredDigest !== sha256(write.after)) {
        throw new OpsxError(
          "SWITCH_JOURNAL_INVALID",
          "Selection-receipt journal digest does not match the reviewed write.",
        );
      }
      const actual = await fileSnapshot(write.target);
      if (!sameSnapshot(write.before, actual)) {
        throw new OpsxError(
          "SWITCH_STALE",
          "Project skill-selection receipt changed before it could be recorded.",
        );
      }
      await applyFileWrite(root, write);
      await runBoundary(options, "selection.receipt");
      updateAction(journal, action.id, "complete");
      await writeJournal(root, journal);
    } catch (error) {
      updateAction(journal, action.id, "failed", error);
      journal.error = {
        code: errorCode(error, "SWITCH_FAILED"),
        message: errorMessage(error),
      };
      await writeJournal(root, journal);
      throw error;
    }
  }

  const postflight = journal.actions.find(
    (item) => item.kind === "postflight" && item.status === "pending",
  );
  if (!postflight)
    throw new OpsxError(
      "SWITCH_JOURNAL_INVALID",
      "Postflight action is missing from the transaction journal.",
    );
  updateAction(journal, postflight.id, "running");
  await writeJournal(root, journal);
  try {
    const nowDefault = await defaultSchema(root);
    if (nowDefault !== plan.preview.request.schema)
      throw new OpsxError(
        "SWITCH_POSTFLIGHT",
        `Project default is ${nowDefault}, not ${plan.preview.request.schema}.`,
      );
    if (plan.bundlePlan) {
      const fresh = await prepareBundledSchema(
        root,
        plan.preview.request.schema,
      );
      if (
        fresh.status !== "intact" ||
        fresh.digest !== plan.preview.schema.digest
      )
        throw new OpsxError(
          "SWITCH_POSTFLIGHT",
          "Project default points to an incomplete bundled schema.",
        );
    }
    await plan.client.command(
      "schema",
      "validate",
      plan.preview.request.schema,
    );
    if (plan.skillPlan) {
      for (const target of skillPlanTargets(plan.skillPlan)) {
        if (
          target.action !== "refuse" &&
          (await treeDigest(target.absoluteTarget)) !== target.sourceDigest
        ) {
          throw new OpsxError(
            "SWITCH_POSTFLIGHT",
            `Required skill target is incomplete: ${target.absoluteTarget}`,
          );
        }
      }
    }
    await runBoundary(options, "postflight");
    updateAction(journal, postflight.id, "complete");
    await writeJournal(root, journal);
  } catch (error) {
    updateAction(journal, postflight.id, "failed", error);
    journal.error = {
      code: errorCode(error, "SWITCH_POSTFLIGHT"),
      message: errorMessage(error),
    };
    await writeJournal(root, journal);
    throw error;
  }
}

export async function apply(
  root: string,
  request: SwitchRequest,
  previewToken: string,
  options: SwitchRuntimeOptions = {},
): Promise<SwitchApplyResult> {
  if (typeof previewToken !== "string" || !previewToken)
    throw new OpsxError(
      "SWITCH_CONFIRMATION_REQUIRED",
      "Apply requires the exact token from a current switch preview.",
    );
  const canonicalRoot = await resolveProject(root, true);
  const release = await acquireProjectMutationLock(canonicalRoot);
  let released = false;
  const unlock = async () => {
    if (!released) {
      released = true;
      await release();
    }
  };
  let journal: SwitchJournal | null = null;
  try {
    const oldJournal = await readJournal(canonicalRoot);
    if (oldJournal && oldJournal.state !== "complete")
      throw new OpsxError(
        "SWITCH_RECOVERY_REQUIRED",
        "A previous switch is incomplete; inspect recovery before starting another Apply.",
      );
    const plan = await installPlan(canonicalRoot, request, options);
    if (plan.preview.token !== previewToken)
      throw new OpsxError(
        "SWITCH_STALE",
        "Switch inputs changed after preview; request a new preview.",
      );
    if (!plan.preview.canApply)
      throw new OpsxError(
        "SWITCH_BLOCKED",
        "Switch preview contains collisions or compatibility findings; no files were changed.",
      );
    if (plan.preview.noOp) {
      await unlock();
      const recovery = await inspectRecovery(canonicalRoot);
      return { status: "unchanged", journal: oldJournal, recovery };
    }
    journal = await buildJournal(plan, previewToken);
    await writeJournal(canonicalRoot, journal);
    try {
      await executePlan(plan, journal, options);
      journal.state = "complete";
      journal.updatedAt = new Date().toISOString();
      await writeJournal(canonicalRoot, journal);
      await unlock();
      const recovery = await inspectRecovery(canonicalRoot);
      return { status: "applied", journal, recovery };
    } catch (error) {
      journal.state = "partial";
      journal.updatedAt = new Date().toISOString();
      journal.error ??= {
        code: errorCode(error, "SWITCH_FAILED"),
        message: errorMessage(error),
      };
      await writeJournal(canonicalRoot, journal);
      await unlock();
      const recovery = await inspectRecovery(canonicalRoot);
      return { status: "partial", journal, recovery };
    }
  } finally {
    await unlock();
  }
}

async function inspectActionTarget(
  action: SwitchJournalAction,
  root: string,
): Promise<Array<SwitchRecovery["writes"][number]>> {
  const result: Array<SwitchRecovery["writes"][number]> = [];
  for (const target of action.targets) {
    if (action.kind === "schema.install") {
      try {
        const bundle = await prepareBundledSchema(
          root,
          action.expected && typeof action.expected === "object"
            ? ((action.expected as { name?: string }).name ?? "")
            : "",
        );
        const complete =
          bundle.status === "intact" &&
          bundle.destination === target &&
          bundle.digest === action.desiredDigest &&
          bundle.targetDigest === action.desiredDigest;
        result.push({
          action: action.kind,
          target,
          state: complete ? "complete" : bundle.status,
          actualDigest: bundle.targetDigest,
          expectedDigest: action.desiredDigest,
        });
      } catch {
        const digest = await treeDigest(target);
        result.push({
          action: action.kind,
          target,
          state: digest ? "present-unverified" : "missing",
          actualDigest: digest ?? undefined,
          expectedDigest: action.desiredDigest,
        });
      }
      continue;
    }
    if (action.kind === "revision.retain") {
      const ref = action.expected as
        | { name?: string; source?: string; digest?: string }
        | undefined;
      if (ref?.name && ref.source && ref.digest) {
        try {
          await inspectRetainedRevision(root, {
            name: ref.name,
            source: ref.source,
            digest: ref.digest,
          });
          result.push({
            action: action.kind,
            target,
            state: "complete",
            actualDigest: ref.digest,
            expectedDigest: ref.digest,
          });
        } catch (error) {
          result.push({
            action: action.kind,
            target,
            state:
              (error as NodeJS.ErrnoException).code === "ENOENT"
                ? "missing"
                : "present-different",
            expectedDigest: ref.digest,
          });
        }
        continue;
      }
    }
    if (action.kind === "skills.install") {
      const expected = action.expected as
        | {
            targets?: Array<{ target?: string; sourceDigest?: string }>;
            ownership?: {
              exists?: boolean;
              digest?: string | null;
              dev?: string | null;
              ino?: string | null;
              mode?: number | null;
              mtimeNs?: string | null;
              ctimeNs?: string | null;
            };
          }
        | undefined;
      if (target === resourceOwnershipPath(root)) {
        try {
          const snapshot = await fileSnapshot(target);
          const before = expected?.ownership;
          const after = action.observed?.[target];
          const unchanged =
            before?.exists === false
              ? !snapshot.exists
              : Boolean(
                  before?.exists &&
                    snapshot.exists &&
                    snapshot.digest === before.digest &&
                    snapshot.dev === before.dev &&
                    snapshot.ino === before.ino &&
                    snapshot.mode === before.mode &&
                    snapshot.mtimeNs === before.mtimeNs &&
                    snapshot.ctimeNs === before.ctimeNs,
                );
          const state =
            after && snapshot.digest === after.digest
              ? "complete"
              : unchanged
                ? "unchanged"
                : !snapshot.exists
                  ? "missing"
                  : "changed-or-incomplete";
          result.push({
            action: action.kind,
            target,
            state,
            actualDigest: snapshot.digest ?? undefined,
            expectedDigest: after?.digest ?? before?.digest ?? undefined,
          });
        } catch {
          result.push({
            action: action.kind,
            target,
            state: "unsafe-or-unreadable",
          });
        }
        continue;
      }
      const digest = await treeDigest(target);
      const expectedDigest = expected?.targets?.find(
        (item) => item.target === target,
      )?.sourceDigest;
      const state = !digest
        ? "missing"
        : digest === expectedDigest
          ? "complete"
          : "present-different";
      result.push({
        action: action.kind,
        target,
        state,
        actualDigest: digest ?? undefined,
        expectedDigest,
      });
      continue;
    }
    const expected = action.desiredDigest;
    try {
      const snapshot = await fileSnapshot(target);
      result.push({
        action: action.kind,
        target,
        state: !snapshot.exists
          ? "missing"
          : snapshot.digest === expected
            ? "complete"
            : "changed-or-incomplete",
        actualDigest: snapshot.digest ?? undefined,
        expectedDigest: expected,
      });
    } catch {
      result.push({
        action: action.kind,
        target,
        state: "unsafe-or-unreadable",
        expectedDigest: expected,
      });
    }
  }
  return result;
}

export async function inspectRecovery(
  rootInput: string,
): Promise<SwitchRecovery> {
  const root = await resolveProject(rootInput, true);
  const journal = await readJournal(root);
  let lock: SwitchRecovery["lock"];
  try {
    const lockFile = lockPath(root);
    const info = await lstat(lockFile);
    if (info.isSymbolicLink() || !info.isFile())
      throw new OpsxError(
        "SWITCH_LOCK_UNSAFE",
        `Switch lock is unsafe: ${lockFile}`,
      );
    lock = {
      path: lockFile,
      holder: await readFile(lockFile, "utf8").catch(() => null),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (!journal)
    return {
      status: lock ? "partial" : "none",
      ...(lock ? { lock } : {}),
      writes: [],
      nextActions: lock
        ? [
            "Confirm the lock owner is no longer running before removing the stale project lock.",
          ]
        : [],
    };
  const writes = (
    await Promise.all(
      journal.actions.flatMap((action) =>
        action.status === "pending" ||
        action.kind === "postflight" ||
        action.kind === "schema.validate"
          ? []
          : [inspectActionTarget(action, root)],
      ),
    )
  ).flat();
  let observedDefault: string | undefined;
  try {
    observedDefault = await defaultSchema(root);
  } catch {
    observedDefault = undefined;
  }
  const status = journal.state === "complete" ? "complete" : "partial";
  const nextActions =
    status === "complete"
      ? ["No recovery is required; the last switch completed successfully."]
      : [
          observedDefault === journal.oldDefault
            ? `The old default ${journal.oldDefault} remains active.`
            : `The project default is ${observedDefault ?? "unreadable"}; verify schema and skill targets before using it.`,
          "Review each journaled target state; do not replay an old preview token.",
          "If every target is complete, create a fresh preview and Apply; resolve or restore any changed target first.",
        ];
  return {
    status,
    journal,
    ...(lock ? { lock } : {}),
    observedDefault,
    writes,
    nextActions,
  };
}
