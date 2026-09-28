import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError, resolveProject } from "../domain/project.ts";
import { changeDirectory, listArchived } from "../archive/index.ts";
import {
  readProvenance,
  revisionRef,
  recordCreation,
  recordMigration,
  retainLegacy,
} from "../provenance/index.ts";
import { readSelectionReceipt } from "../switch/index.ts";
import type {
  ChangeSelectionAssociation,
  Provenance,
} from "../provenance/index.ts";
import {
  checkRevision,
  resolveRevision,
  retainRevision,
} from "../revisions/index.ts";
import type { Revision, RevisionRef } from "../revisions/index.ts";
import {
  loadAgentProfileDigest,
  loadSkillBundles,
  previewSkillInstall,
} from "../resources/index.ts";
import type { SkillBundle, SkillInstallHostId } from "../resources/index.ts";
import type { ValidationResult } from "../validation/index.ts";

export type LifecycleAction =
  | "change.create"
  | "change.status"
  | "change.instructions"
  | "change.validate"
  | "change.archive"
  | "change.schema-handoff";
export interface ActionTarget {
  root: string;
  change?: string;
  artifact?: string;
  schema?: string;
}
export interface ApplyConfirmation {
  token: string;
  exactTarget: string;
  freshness: string;
}
export interface ActionSuccess<T> {
  version: 1;
  ok: true;
  action: LifecycleAction;
  phase: "read" | "preview" | "applied";
  target: ActionTarget;
  data: T;
  confirmation?: ApplyConfirmation;
}
export interface ActionFailure {
  version: 1;
  ok: false;
  action: LifecycleAction;
  phase: "error";
  target?: ActionTarget;
  error: { code: string; message: string };
  data?: unknown;
}
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export interface ChangeSelection {
  profiles: string[];
  skillHosts: SkillInstallHostId[];
  skillBundle: SkillBundle;
}
export interface CreateChangeInput {
  change: string;
  description: string;
  goal?: string;
  schema?: string;
  profiles?: string[];
  skillHosts?: SkillInstallHostId[];
  skillBundle?: SkillBundle;
}
export interface MutationOptions {
  applyToken?: string;
}
export interface CreatePreview {
  ready: true;
  change: string;
  schema: RevisionRef;
  description: string;
  goal?: string;
  command: string[];
  association: ChangeSelectionAssociation;
  associationSource: "explicit" | "switch" | "no-skills";
  associationEvidence: string | null;
}
export interface CreateReceipt {
  change: string;
  schema: RevisionRef;
  retainedRevision: string;
  openSpec: unknown;
  association: ChangeSelectionAssociation;
}
export interface ArchivePreview {
  ready: true;
  change: string;
  status: unknown;
  files: number;
  archivedNames: string[];
  currentRevision: RevisionRef;
  createdUnder: RevisionRef | "Unknown";
  retainCurrentRevision: boolean;
}
export interface ArchiveReceipt {
  change: string;
  archived: true;
  openSpec: unknown;
}
export interface SchemaHandoffPreview {
  ready: boolean;
  change: string;
  from: RevisionRef;
  to: RevisionRef;
  inherited: boolean;
  noOp: boolean;
  createdUnder: RevisionRef | "Unknown";
  retainCurrentRevision: boolean;
  validation: ValidationResult;
}
export interface SchemaHandoffReceipt {
  change: string;
  from: RevisionRef;
  to: RevisionRef;
  migrated: boolean;
  validation: ValidationResult;
}

interface TokenPayload {
  version: 1;
  action: LifecycleAction;
  target: ActionTarget;
  freshness: string;
}
interface InternalPlan<T> {
  target: ActionTarget;
  data: T;
  freshness: string;
  noOp?: boolean;
  guards?: { tree: string; metadata: string | null; config: string };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const JSON_VERSION = 1;

async function runValidation(
  root: string,
  change: string,
): Promise<ValidationResult> {
  const validation = await import("../validation/index.ts");
  return validation.validateChange(root, change);
}

async function runValidationAgainst(
  root: string,
  change: string,
  schema: string,
): Promise<ValidationResult> {
  const validation = await import("../validation/index.ts");
  return validation.validateChangeAgainst(root, change, schema);
}

function fail(
  action: LifecycleAction,
  error: unknown,
  target?: ActionTarget,
  data?: unknown,
): ActionFailure {
  const value =
    error instanceof OpsxError
      ? { code: error.code, message: error.message }
      : {
          code: "LIFECYCLE_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
  return {
    version: JSON_VERSION,
    ok: false,
    action,
    phase: "error",
    ...(target ? { target } : {}),
    error: value,
    ...(data !== undefined ? { data } : {}),
  };
}

function success<T>(
  action: LifecycleAction,
  phase: ActionSuccess<T>["phase"],
  target: ActionTarget,
  data: T,
  confirmation?: ApplyConfirmation,
): ActionSuccess<T> {
  return {
    version: JSON_VERSION,
    ok: true,
    action,
    phase,
    target,
    data,
    ...(confirmation ? { confirmation } : {}),
  };
}

function safeIdentifier(value: string, kind: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value))
    throw new OpsxError("UNSAFE_PATH", `Unsafe ${kind}: ${String(value)}`);
  return value;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function makeToken(
  action: LifecycleAction,
  target: ActionTarget,
  freshness: string,
): string {
  const payload: TokenPayload = { version: 1, action, target, freshness };
  const encoded = Buffer.from(stable(payload)).toString("base64url");
  return `opsx-preview-v1.${encoded}.${digest(encoded)}`;
}

function readToken(
  token: string | undefined,
  action: LifecycleAction,
  target: ActionTarget,
): TokenPayload {
  if (!token)
    throw new OpsxError(
      "APPLY_TOKEN_REQUIRED",
      "Mutation is preview-only by default. Supply the exact apply token returned by this preview.",
    );
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== "opsx-preview-v1" ||
    digest(parts[1]!) !== parts[2]
  ) {
    throw new OpsxError(
      "APPLY_TOKEN_INVALID",
      "The apply token is malformed or has been changed; request a fresh preview.",
    );
  }
  let payload: TokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf8"),
    ) as TokenPayload;
  } catch {
    throw new OpsxError(
      "APPLY_TOKEN_INVALID",
      "The apply token cannot be decoded; request a fresh preview.",
    );
  }
  if (
    payload?.version !== 1 ||
    payload.action !== action ||
    stable(payload.target) !== stable(target) ||
    typeof payload.freshness !== "string"
  ) {
    throw new OpsxError(
      "APPLY_TOKEN_TARGET_MISMATCH",
      "The apply token belongs to a different action or exact target.",
    );
  }
  return payload;
}

function confirmation(
  action: LifecycleAction,
  target: ActionTarget,
  freshness: string,
  exactTarget: string,
): ApplyConfirmation {
  return {
    token: makeToken(action, target, freshness),
    exactTarget,
    freshness,
  };
}

async function projectRoot(root: string): Promise<string> {
  const canonical = await resolveProject(root, true);
  await requireRealDirectory(
    path.join(canonical, "openspec"),
    "OpenSpec directory",
  );
  await requireRealFile(
    path.join(canonical, "openspec", "config.yaml"),
    "OpenSpec project config",
  );
  return canonical;
}

async function requireRealDirectory(
  file: string,
  label: string,
): Promise<void> {
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new OpsxError("UNSAFE_PATH", `${label} is missing: ${file}`);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new OpsxError(
      "UNSAFE_PATH",
      `${label} must be a real directory: ${file}`,
    );
}

async function requireRealFile(file: string, label: string): Promise<void> {
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new OpsxError("UNSAFE_PATH", `${label} is missing: ${file}`);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink())
    throw new OpsxError(
      "UNSAFE_PATH",
      `${label} must be a regular file: ${file}`,
    );
}

async function readSafe(file: string, label = file): Promise<Buffer> {
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOOP")
      throw new OpsxError("UNSAFE_PATH", `${label} must not be a symlink.`);
    throw error;
  }
  try {
    if (!(await handle.stat()).isFile())
      throw new OpsxError("UNSAFE_PATH", `${label} must be a regular file.`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function configuredSchema(root: string): Promise<string> {
  const bytes = await readSafe(
    path.join(root, "openspec", "config.yaml"),
    "OpenSpec project config",
  );
  let value: unknown;
  try {
    value = YAML.parse(bytes.toString("utf8"));
  } catch {
    throw new OpsxError(
      "PROJECT_CONFIG",
      "OpenSpec project config is invalid YAML.",
    );
  }
  if (value == null) return "spec-driven";
  if (typeof value !== "object" || Array.isArray(value))
    throw new OpsxError(
      "PROJECT_CONFIG",
      "OpenSpec project config must be a mapping.",
    );
  const schema = (value as Record<string, unknown>).schema;
  if (schema == null) return "spec-driven";
  if (typeof schema !== "string" || !SAFE_ID.test(schema))
    throw new OpsxError(
      "PROJECT_CONFIG",
      "OpenSpec project schema must be a safe nonempty name.",
    );
  return schema;
}

async function activeDirectory(root: string, change: string): Promise<string> {
  safeIdentifier(change, "change name");
  await requireRealDirectory(
    path.join(root, "openspec", "changes"),
    "Active changes directory",
  );
  return changeDirectory(root, change);
}

async function fingerprintTree(
  directory: string,
  copyTo?: string,
  omitProvenance = false,
): Promise<{ fingerprint: string; files: number }> {
  const records: Array<{
    path: string;
    type: "file" | "directory";
    bytes?: number;
    digest?: string;
  }> = [];
  async function visit(source: string, relative: string): Promise<void> {
    const entries = await readdir(source, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (omitProvenance && childRelative === ".opsx-provenance.json") continue;
      const sourcePath = path.join(source, entry.name);
      const info = await lstat(sourcePath);
      if (info.isSymbolicLink())
        throw new OpsxError(
          "UNSAFE_PATH",
          `Symlink in change ${directory}: ${childRelative}`,
        );
      if (info.isDirectory()) {
        records.push({ path: childRelative, type: "directory" });
        if (copyTo)
          await mkdir(path.join(copyTo, childRelative), { recursive: true });
        await visit(sourcePath, childRelative);
      } else if (info.isFile()) {
        const bytes = await readSafe(sourcePath, childRelative);
        records.push({
          path: childRelative,
          type: "file",
          bytes: bytes.length,
          digest: digest(bytes),
        });
        if (copyTo) {
          const destination = path.join(copyTo, childRelative);
          await mkdir(path.dirname(destination), { recursive: true });
          await writeFile(destination, bytes, {
            flag: "wx",
            mode: info.mode & 0o777,
          });
        }
      } else
        throw new OpsxError(
          "UNSAFE_PATH",
          `Unsupported filesystem entry in change: ${childRelative}`,
        );
    }
  }
  if (copyTo) await mkdir(copyTo, { recursive: true });
  await visit(directory, "");
  return {
    fingerprint: digest(stable(records)),
    files: records.filter((entry) => entry.type === "file").length,
  };
}

async function statusFor(
  client: OpenSpecClient,
  change: string,
): Promise<unknown> {
  return client.json("status", "--change", change);
}

async function verifiedSelection(
  root: string,
  revision: Revision,
  explicit?: Partial<ChangeSelection>,
): Promise<{
  association: ChangeSelectionAssociation;
  source: CreatePreview["associationSource"];
  evidence: string | null;
}> {
  const catalog = await loadSkillBundles(revision.source);
  const receipt =
    explicit === undefined ? await readSelectionReceipt(root) : null;
  const selectedBundle =
    explicit?.skillBundle ??
    (receipt &&
    stable(receipt.effectiveRevision) === stable(revisionRef(revision))
      ? receipt.skillBundle
      : "default");
  if (!catalog.bundles.includes(selectedBundle))
    throw new OpsxError(
      "SKILL_BUNDLE_INVALID",
      `Skill bundle ${selectedBundle} is not declared by ${revision.name}.`,
    );
  const declarations = catalog.declarations[selectedBundle] ?? [];
  const inherited =
    receipt &&
    stable(receipt.effectiveRevision) === stable(revisionRef(revision))
      ? receipt
      : null;
  const selection: ChangeSelection =
    explicit === undefined
      ? {
          profiles: [...(inherited?.profiles ?? [])],
          skillHosts: [...(inherited?.skillHosts ?? [])],
          skillBundle: selectedBundle,
        }
      : {
          profiles: [...(explicit.profiles ?? [])],
          skillHosts: [...(explicit.skillHosts ?? [])],
          skillBundle: selectedBundle,
        };
  const manifestDigests = {
    agentProfiles: await loadAgentProfileDigest(),
    schemaSkills: catalog.manifestDigests.skills,
    skillBundles: catalog.manifestDigests.profiles,
  };
  if (
    inherited &&
    stable(inherited.manifestDigests) !== stable(manifestDigests)
  ) {
    throw new OpsxError(
      "RESOURCE_SELECTION_UNVERIFIED",
      "Schema switch selection manifests changed; preview and apply a new switch before creating a change.",
    );
  }
  const association: ChangeSelectionAssociation = {
    version: 1,
    effectiveRevision: revisionRef(revision),
    ...selection,
    manifestDigests,
  };
  if (
    declarations.length > 0 &&
    selection.profiles.length === 0 &&
    selection.skillHosts.length === 0
  ) {
    throw new OpsxError(
      "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
      `Schema ${revision.name} declares managed skills. Select --profile or --skill-host and --bundle, or apply a verified schema switch first.`,
    );
  }
  if (
    declarations.length === 0 &&
    selection.profiles.length === 0 &&
    selection.skillHosts.length === 0
  ) {
    return {
      association,
      source: explicit ? "explicit" : inherited ? "switch" : "no-skills",
      evidence: null,
    };
  }
  const plan = await previewSkillInstall({
    projectRoot: root,
    schemaRoot: revision.source,
    ...selection,
  });
  if (stable(plan.manifestDigests) !== stable(manifestDigests))
    throw new OpsxError(
      "RESOURCE_SELECTION_UNVERIFIED",
      "Selected skill manifests changed during verification.",
    );
  const pending = [
    ...plan.targets
      .filter((target) => target.action !== "noop")
      .map((target) => target.relativeTarget),
    ...plan.skillHosts.flatMap((host) =>
      host.targets
        .filter((target) => target.action !== "noop")
        .map((target) => target.relativeTarget),
    ),
  ];
  if (plan.diagnostics.length > 0 || pending.length > 0) {
    throw new OpsxError(
      "RESOURCE_SELECTION_UNVERIFIED",
      `Selected skills are not installed and verified for ${revision.name}: ${[...pending, ...plan.diagnostics.map((diagnostic) => diagnostic.message)].join("; ")}. Preview skills install first.`,
    );
  }
  return {
    association,
    source: explicit ? "explicit" : "switch",
    evidence: plan.inputDigest,
  };
}

async function buildCreatePlan(
  rootInput: string,
  input: CreateChangeInput,
): Promise<InternalPlan<CreatePreview>> {
  const root = await projectRoot(rootInput);
  const change = safeIdentifier(input.change, "change name");
  if (typeof input.description !== "string" || !input.description.trim())
    throw new OpsxError(
      "CHANGE_DESCRIPTION",
      "A nonempty change description is required.",
    );
  if (
    input.goal !== undefined &&
    (typeof input.goal !== "string" || !input.goal.trim())
  )
    throw new OpsxError("CHANGE_GOAL", "A supplied goal must be nonempty.");
  const schemaName = safeIdentifier(
    input.schema ?? (await configuredSchema(root)),
    "schema name",
  );
  const changesDirectory = path.join(root, "openspec", "changes");
  await requireRealDirectory(changesDirectory, "Active changes directory");
  const changePath = path.join(changesDirectory, change);
  try {
    await lstat(changePath);
    throw new OpsxError(
      "CHANGE_EXISTS",
      `Change ${change} already exists; creation requires a new exact target.`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const client = new OpenSpecClient(root);
  const revision = await resolveRevision(client, schemaName);
  if (revision.shadows.length)
    throw new OpsxError(
      "SCHEMA_AMBIGUOUS",
      "Schema " +
        schemaName +
        " has same-name shadows; resolve the schema source before creating a change.",
    );
  const explicit =
    input.profiles !== undefined ||
    input.skillHosts !== undefined ||
    input.skillBundle !== undefined
      ? {
          profiles: input.profiles,
          skillHosts: input.skillHosts,
          skillBundle: input.skillBundle,
        }
      : undefined;
  const association = await verifiedSelection(root, revision, explicit);
  const config = await readSafe(
    path.join(root, "openspec", "config.yaml"),
    "OpenSpec project config",
  );
  const fingerprint = digest(
    stable({
      root,
      change,
      description: input.description,
      goal: input.goal ?? null,
      schema: revision,
      association,
      config: digest(config),
      changePath: "absent",
    }),
  );
  const command = [
    "new",
    "change",
    change,
    "--description",
    input.description,
    ...(input.goal ? ["--goal", input.goal] : []),
    "--schema",
    schemaName,
  ];
  return {
    target: { root, change, schema: schemaName },
    freshness: fingerprint,
    data: {
      ready: true,
      change,
      schema: revisionRef(revision),
      description: input.description,
      ...(input.goal ? { goal: input.goal } : {}),
      command,
      association: association.association,
      associationSource: association.source,
      associationEvidence: association.evidence,
    },
  };
}

export async function createChange(
  root: string,
  input: CreateChangeInput,
  options: MutationOptions = {},
): Promise<ActionResult<CreatePreview | CreateReceipt>> {
  const action: LifecycleAction = "change.create";
  let target: ActionTarget | undefined;
  try {
    const first = await buildCreatePlan(root, input);
    target = first.target;
    const confirm = confirmation(
      action,
      first.target,
      first.freshness,
      `Create change ${first.data.change} in ${first.target.root} using schema ${first.data.schema.name}`,
    );
    if (!options.applyToken)
      return success(action, "preview", first.target, first.data, confirm);
    const token = readToken(options.applyToken, action, first.target);
    const current = await buildCreatePlan(root, input);
    if (token.freshness !== current.freshness)
      throw new OpsxError(
        "STALE_PREVIEW",
        `Creation preview for ${input.change} is stale; request a new preview.`,
      );
    const client = new OpenSpecClient(current.target.root);
    const liveRevision = await resolveRevision(
      client,
      current.data.schema.name,
    );
    if (
      liveRevision.source !== current.data.schema.source ||
      liveRevision.digest !== current.data.schema.digest
    ) {
      throw new OpsxError(
        "STALE_PREVIEW",
        "Effective schema revision changed immediately before creation.",
      );
    }
    const config = await readSafe(
      path.join(current.target.root, "openspec", "config.yaml"),
      "OpenSpec project config",
    );
    try {
      await lstat(
        path.join(
          current.target.root,
          "openspec",
          "changes",
          current.data.change,
        ),
      );
      throw new OpsxError(
        "STALE_PREVIEW",
        "Change " +
          current.data.change +
          " appeared after its creation preview.",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const finalAssociation = await verifiedSelection(
      current.target.root,
      liveRevision,
      input.profiles !== undefined ||
        input.skillHosts !== undefined ||
        input.skillBundle !== undefined
        ? {
            profiles: input.profiles,
            skillHosts: input.skillHosts,
            skillBundle: input.skillBundle,
          }
        : undefined,
    );
    const finalFreshness = digest(
      stable({
        root: current.target.root,
        change: current.data.change,
        description: current.data.description,
        goal: current.data.goal ?? null,
        schema: liveRevision,
        association: finalAssociation,
        config: digest(config),
        changePath: "absent",
      }),
    );
    if (token.freshness !== finalFreshness)
      throw new OpsxError(
        "STALE_PREVIEW",
        "Creation preview for " +
          current.data.change +
          " is stale immediately before OpenSpec creation.",
      );
    const openSpec = await client.json(...current.data.command);
    try {
      await retainRevision(current.target.root, liveRevision);
      await recordCreation(
        current.target.root,
        current.data.change,
        revisionRef(liveRevision),
        current.data.association,
      );
      const directory = await changeDirectory(
        current.target.root,
        current.data.change,
      );
      const history = await readProvenance(directory);
      if (
        !history ||
        stable(history.created) !== stable(revisionRef(liveRevision)) ||
        stable(history.association) !== stable(current.data.association)
      )
        throw new OpsxError(
          "PROVENANCE_INVALID",
          `Creation provenance and selection were not recorded for ${current.data.change}.`,
        );
      return success(action, "applied", current.target, {
        change: current.data.change,
        schema: revisionRef(liveRevision),
        retainedRevision: path.join(
          current.target.root,
          "openspec",
          ".opsx",
          "revisions",
          liveRevision.name,
          liveRevision.digest,
        ),
        openSpec,
        association: current.data.association,
      });
    } catch (error) {
      throw new OpsxError(
        "CREATE_PARTIAL",
        `OpenSpec created ${current.data.change}, but revision/provenance finalization failed: ${error instanceof Error ? error.message : String(error)}. The change was left intact for recovery.`,
      );
    }
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function getChangeStatus(
  rootInput: string,
  changeInput: string,
): Promise<ActionResult<unknown>> {
  const action: LifecycleAction = "change.status";
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    target = { root, change };
    await activeDirectory(root, change);
    return success(
      action,
      "read",
      target,
      await statusFor(new OpenSpecClient(root), change),
    );
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function getArtifactInstructions(
  rootInput: string,
  changeInput: string,
  artifactInput: string,
): Promise<ActionResult<unknown>> {
  const action: LifecycleAction = "change.instructions";
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    const artifact = safeIdentifier(artifactInput, "artifact name");
    target = { root, change, artifact };
    await activeDirectory(root, change);
    const instructions = await new OpenSpecClient(root).json(
      "instructions",
      artifact,
      "--change",
      change,
    );
    return success(action, "read", target, instructions);
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function validateChangeAction(
  rootInput: string,
  changeInput: string,
): Promise<ActionResult<ValidationResult>> {
  const action: LifecycleAction = "change.validate";
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput);
    const change = safeIdentifier(changeInput, "change name");
    target = { root, change };
    await activeDirectory(root, change);
    return success(action, "read", target, await runValidation(root, change));
  } catch (error) {
    return fail(action, error, target);
  }
}

async function buildArchivePlan(
  rootInput: string,
  changeInput: string,
): Promise<InternalPlan<ArchivePreview>> {
  const root = await projectRoot(rootInput);
  const change = safeIdentifier(changeInput, "change name");
  const directory = await activeDirectory(root, change);
  const client = new OpenSpecClient(root);
  const metadata = await metadataFor(directory);
  const schemaName =
    typeof metadata.value.schema === "string"
      ? metadata.value.schema
      : await configuredSchema(root);
  const liveRevision = await resolveRevision(client, schemaName);
  const revisionInfo = await currentRevisionInfo(
    root,
    change,
    liveRevision,
    client,
  );
  const status = await statusFor(client, change);
  const tree = await fingerprintTree(directory);
  const contentTree = await fingerprintTree(directory, undefined, true);
  const archived = await listArchived(root);
  const configFingerprint = await readConfigFingerprint(root);
  const freshness = digest(
    stable({
      root,
      change,
      status,
      tree: tree.fingerprint,
      archived,
      revisionInfo,
      configFingerprint,
    }),
  );
  return {
    target: { root, change },
    freshness,
    guards: {
      tree: contentTree.fingerprint,
      metadata: metadata.bytes ? digest(metadata.bytes) : null,
      config: configFingerprint,
    },
    data: {
      ready: true,
      change,
      status,
      files: tree.files,
      archivedNames: archived.map((entry) => entry.name),
      currentRevision: revisionInfo.ref,
      createdUnder: revisionInfo.createdUnder,
      retainCurrentRevision: revisionInfo.retainCurrentRevision,
    },
  };
}

export async function archiveChange(
  root: string,
  change: string,
  options: MutationOptions = {},
): Promise<ActionResult<ArchivePreview | ArchiveReceipt>> {
  const action: LifecycleAction = "change.archive";
  let target: ActionTarget | undefined;
  try {
    const first = await buildArchivePlan(root, change);
    target = first.target;
    const exactTarget = `Archive active change ${change} in ${first.target.root} using OpenSpec`;
    const confirm = confirmation(
      action,
      first.target,
      first.freshness,
      exactTarget,
    );
    if (!options.applyToken)
      return success(action, "preview", first.target, first.data, confirm);
    const token = readToken(options.applyToken, action, first.target);
    let current: InternalPlan<ArchivePreview>;
    try {
      current = await buildArchivePlan(root, change);
    } catch (error) {
      throw new OpsxError(
        "STALE_PREVIEW",
        `Archive preview for ${change} is stale: ${error instanceof Error ? error.message : String(error)}. Request a new preview.`,
      );
    }
    if (token.freshness !== current.freshness)
      throw new OpsxError(
        "STALE_PREVIEW",
        `Archive preview for ${change} is stale; request a new preview.`,
      );
    const client = new OpenSpecClient(current.target.root);
    const directory = await changeDirectory(current.target.root, change);
    const liveRevision = await resolveRevision(
      client,
      current.data.currentRevision.name,
    );
    if (
      liveRevision.source !== current.data.currentRevision.source ||
      liveRevision.digest !== current.data.currentRevision.digest
    ) {
      throw new OpsxError(
        "STALE_PREVIEW",
        "Effective schema revision changed immediately before archive.",
      );
    }
    await retainCurrentRevision(
      current.target.root,
      change,
      liveRevision,
      current.data.createdUnder,
    );
    const validation = await runValidation(current.target.root, change);
    if (!validation.ok)
      throw new OpsxError(
        "ARCHIVE_VALIDATION_FAILED",
        "Strict validation blocked archive of " +
          change +
          ": " +
          stable(validation.findings),
      );
    await verifyPlanGuards(current, directory);
    if (stable(await statusFor(client, change)) !== stable(current.data.status))
      throw new OpsxError(
        "STALE_PREVIEW",
        "OpenSpec status changed during guarded archive.",
      );
    const before = new Set(current.data.archivedNames);
    const openSpec = await client.json("archive", change, "-y");
    let stillActive = true;
    try {
      await changeDirectory(current.target.root, change);
    } catch (error) {
      if (error instanceof OpsxError && error.code === "CHANGE_NOT_FOUND")
        stillActive = false;
      else throw error;
    }
    if (stillActive)
      throw new OpsxError(
        "ARCHIVE_NOT_CONFIRMED",
        `OpenSpec returned without moving ${change} out of active changes.`,
      );
    const after = await listArchived(current.target.root);
    const added = after.filter((entry) => !before.has(entry.name));
    if (!added.length)
      throw new OpsxError(
        "ARCHIVE_NOT_CONFIRMED",
        `OpenSpec moved ${change}, but no new archived record was visible.`,
      );
    return success(action, "applied", current.target, {
      change,
      archived: true,
      openSpec,
    });
  } catch (error) {
    return fail(action, error, target);
  }
}

async function metadataFor(directory: string): Promise<{
  exists: boolean;
  bytes: Buffer | null;
  value: Record<string, unknown>;
}> {
  const file = path.join(directory, ".openspec.yaml");
  let bytes: Buffer;
  try {
    bytes = await readSafe(file, ".openspec.yaml");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { exists: false, bytes: null, value: {} };
    throw error;
  }
  let value: unknown;
  try {
    value = YAML.parse(bytes.toString("utf8"));
  } catch {
    throw new OpsxError("CHANGE_METADATA_INVALID", `Invalid YAML in ${file}.`);
  }
  if (value == null) value = {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new OpsxError(
      "CHANGE_METADATA_INVALID",
      `${file} must contain a YAML mapping.`,
    );
  const metadata = value as Record<string, unknown>;
  if (
    metadata.schema != null &&
    (typeof metadata.schema !== "string" || !SAFE_ID.test(metadata.schema))
  )
    throw new OpsxError(
      "CHANGE_METADATA_INVALID",
      `Invalid schema pin in ${file}.`,
    );
  return { exists: true, bytes, value: metadata };
}

async function writeMetadata(
  directory: string,
  expected: Buffer | null,
  nextValue: Record<string, unknown>,
): Promise<void> {
  const file = path.join(directory, ".openspec.yaml");
  const current = await metadataFor(directory);
  if (
    (expected === null) !== !current.exists ||
    (expected && (!current.bytes || !current.bytes.equals(expected)))
  ) {
    throw new OpsxError(
      "STALE_PREVIEW",
      `Change metadata changed immediately before write: ${file}`,
    );
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, YAML.stringify(nextValue), {
      flag: "wx",
      mode: 0o600,
    });
    const beforeCommit = await metadataFor(directory);
    if (
      (expected === null) !== !beforeCommit.exists ||
      (expected &&
        (!beforeCommit.bytes || !beforeCommit.bytes.equals(expected)))
    ) {
      throw new OpsxError(
        "STALE_PREVIEW",
        `Change metadata changed during handoff: ${file}`,
      );
    }
    if (expected === null) {
      try {
        await link(temporary, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST")
          throw new OpsxError(
            "STALE_PREVIEW",
            `Change metadata appeared during handoff: ${file}`,
          );
        throw error;
      }
    } else await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readConfigFingerprint(root: string): Promise<string> {
  return digest(
    await readSafe(
      path.join(root, "openspec", "config.yaml"),
      "OpenSpec project config",
    ),
  );
}

async function verifyPlanGuards(
  plan: InternalPlan<unknown>,
  directory: string,
): Promise<void> {
  if (!plan.guards) return;
  const tree = await fingerprintTree(directory, undefined, true);
  const metadata = await metadataFor(directory);
  const config = await readConfigFingerprint(plan.target.root);
  if (
    tree.fingerprint !== plan.guards.tree ||
    (metadata.bytes ? digest(metadata.bytes) : null) !== plan.guards.metadata ||
    config !== plan.guards.config
  ) {
    throw new OpsxError(
      "STALE_PREVIEW",
      "Change artifacts, schema metadata, or project config changed during guarded mutation.",
    );
  }
}

interface CurrentRevisionInfo {
  ref: RevisionRef;
  createdUnder: RevisionRef | "Unknown";
  retainCurrentRevision: boolean;
}

async function currentRevisionInfo(
  root: string,
  change: string,
  schemaRevision: Revision,
  client: OpenSpecClient,
): Promise<CurrentRevisionInfo> {
  if (schemaRevision.shadows.length)
    throw new OpsxError(
      "SCHEMA_AMBIGUOUS",
      "Effective schema " +
        schemaRevision.name +
        " has same-name shadows; resolve the schema source before mutation.",
    );
  const directory = await changeDirectory(root, change);
  const provenance = await readProvenance(directory);
  const recorded =
    provenance?.migrations.at(-1)?.to ??
    provenance?.retained ??
    provenance?.created ??
    null;
  if (!recorded)
    return {
      ref: revisionRef(schemaRevision),
      createdUnder: provenance?.created ?? "Unknown",
      retainCurrentRevision: true,
    };
  if (
    recorded.name !== schemaRevision.name ||
    recorded.source !== schemaRevision.source ||
    recorded.digest !== schemaRevision.digest
  ) {
    throw new OpsxError(
      "REVISION_DIVERGED",
      "Recorded current revision for " +
        change +
        " does not match live schema " +
        schemaRevision.name +
        "; resolve schema drift before migration.",
    );
  }
  const check = await checkRevision(root, recorded, client);
  if (
    !check.revision ||
    check.revision.source !== recorded.source ||
    check.revision.digest !== recorded.digest
  ) {
    throw new OpsxError(
      "REVISION_" + check.state.toUpperCase(),
      "Current schema revision " +
        recorded.name +
        " is " +
        check.state +
        "; handoff is blocked.",
    );
  }
  return {
    ref: recorded,
    createdUnder: provenance?.created ?? "Unknown",
    retainCurrentRevision: !check.retained,
  };
}

async function retainCurrentRevision(
  root: string,
  change: string,
  revision: Revision,
  createdUnder: RevisionRef | "Unknown",
): Promise<void> {
  await retainRevision(root, revision);
  if (createdUnder !== "Unknown") return;
  const provenance = await readProvenance(await changeDirectory(root, change));
  if (
    !provenance ||
    (!provenance.retained && provenance.migrations.length === 0)
  ) {
    await retainLegacy(root, change, revisionRef(revision));
  }
}

async function copyLocalSchema(
  root: string,
  revision: Revision,
  stageRoot: string,
): Promise<void> {
  const canonicalRoot = await realpath(root);
  const source = await realpath(revision.source);
  const relative = path.relative(canonicalRoot, source);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    return;
  const destination = path.join(stageRoot, relative);
  const st = await lstat(source);
  if (st.isSymbolicLink() || !st.isDirectory())
    throw new OpsxError(
      "UNSAFE_PATH",
      `Schema source is not a real directory: ${source}`,
    );
  await fingerprintTree(source, destination);
}

async function stageSchemaValidation(
  root: string,
  change: string,
  from: Revision,
  to: Revision,
): Promise<ValidationResult> {
  const sourceDirectory = await changeDirectory(root, change);
  if ((await readProvenance(sourceDirectory))?.association) {
    throw new OpsxError(
      "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
      "Standalone schema handoff cannot migrate an associated change without a reviewed target selection; use a guarded schema switch.",
    );
  }
  const stageRoot = await mkdtemp(
    path.join(os.tmpdir(), "opsx-schema-handoff-"),
  );
  try {
    const stagedChange = path.join(stageRoot, "openspec", "changes", change);
    await fingerprintTree(sourceDirectory, stagedChange);
    await mkdir(path.dirname(stagedChange), { recursive: true });
    const config = await readSafe(
      path.join(root, "openspec", "config.yaml"),
      "OpenSpec project config",
    );
    await mkdir(path.join(stageRoot, "openspec"), { recursive: true });
    await writeFile(path.join(stageRoot, "openspec", "config.yaml"), config, {
      flag: "wx",
    });
    await copyLocalSchema(root, from, stageRoot);
    await copyLocalSchema(root, to, stageRoot);

    const stageClient = new OpenSpecClient(stageRoot);
    const stagedTo = await resolveRevision(stageClient, to.name);
    const stagedFrom =
      from.name === to.name
        ? stagedTo
        : await resolveRevision(stageClient, from.name);
    if (stagedTo.digest !== to.digest || stagedFrom.digest !== from.digest)
      throw new OpsxError(
        "STALE_PREVIEW",
        "Schema graph changed while preparing target validation.",
      );
    const stagedTarget = revisionRef(stagedTo);
    const stagedSource = revisionRef(stagedFrom);
    const stagedMetadata = await metadataFor(stagedChange);
    await writeMetadata(stagedChange, stagedMetadata.bytes, {
      ...stagedMetadata.value,
      schema: to.name,
    });
    await retainRevision(stageRoot, stagedFrom);
    await retainRevision(stageRoot, stagedTo);
    // The staged validation models only the current pin transition; keep original
    // creation history out of the throwaway project, then record this transition.
    await writeFile(
      path.join(stagedChange, ".opsx-provenance.json"),
      `${JSON.stringify({ version: 1, created: null, migrations: [] } satisfies Provenance, null, 2)}\n`,
    );
    await retainLegacy(stageRoot, change, stagedSource);
    await recordMigration(stageRoot, change, stagedSource, stagedTarget);
    return await runValidation(stageRoot, change);
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

async function buildHandoffPlan(
  rootInput: string,
  changeInput: string,
  schemaInput: string,
): Promise<InternalPlan<SchemaHandoffPreview>> {
  const root = await projectRoot(rootInput);
  const change = safeIdentifier(changeInput, "change name");
  const destination = safeIdentifier(schemaInput, "schema name");
  const directory = await activeDirectory(root, change);
  const metadata = await metadataFor(directory);
  const currentSchema =
    typeof metadata.value.schema === "string"
      ? metadata.value.schema
      : await configuredSchema(root);
  const client = new OpenSpecClient(root);
  const [fromRevision, toRevision] = await Promise.all([
    resolveRevision(client, currentSchema),
    resolveRevision(client, destination),
  ]);
  const sourceInfo = await currentRevisionInfo(
    root,
    change,
    fromRevision,
    client,
  );
  const from = sourceInfo.ref;
  const createdUnder = sourceInfo.createdUnder;
  const retainCurrentRevision = sourceInfo.retainCurrentRevision;
  if (toRevision.shadows.length)
    throw new OpsxError(
      "SCHEMA_AMBIGUOUS",
      `Schema ${destination} has same-name shadows; resolve the schema source before handoff.`,
    );
  if (from.name === toRevision.name) {
    if (from.digest !== toRevision.digest || from.source !== toRevision.source)
      throw new OpsxError(
        "SCHEMA_SAME_NAME_DRIFT",
        `Cannot hand off ${change} between different revisions with the same schema name ${destination}.`,
      );
    const validation = await runValidation(root, change);
    const tree = await fingerprintTree(directory);
    const freshness = digest(
      stable({
        root,
        change,
        from,
        to: toRevision,
        createdUnder,
        retainCurrentRevision,
        tree: tree.fingerprint,
        config: await readConfigFingerprint(root),
        metadata: metadata.bytes ? digest(metadata.bytes) : null,
        validation,
      }),
    );
    return {
      target: { root, change, schema: destination },
      freshness,
      noOp: true,
      data: {
        ready: validation.ok,
        change,
        from,
        to: revisionRef(toRevision),
        inherited: metadata.value.schema == null,
        noOp: true,
        createdUnder,
        retainCurrentRevision,
        validation,
      },
    };
  }
  const validation = await stageSchemaValidation(
    root,
    change,
    fromRevision,
    toRevision,
  );
  const tree = await fingerprintTree(directory);
  const configFingerprint = await readConfigFingerprint(root);
  const provenance = await readProvenance(directory);
  const contentTree = await fingerprintTree(directory, undefined, true);
  const freshness = digest(
    stable({
      root,
      change,
      from,
      to: toRevision,
      createdUnder,
      retainCurrentRevision,
      tree: tree.fingerprint,
      configFingerprint,
      metadata: metadata.bytes ? digest(metadata.bytes) : null,
      provenance,
      validation,
    }),
  );
  return {
    target: { root, change, schema: destination },
    freshness,
    guards: {
      tree: contentTree.fingerprint,
      metadata: metadata.bytes ? digest(metadata.bytes) : null,
      config: configFingerprint,
    },
    data: {
      ready: validation.ok,
      change,
      from,
      to: revisionRef(toRevision),
      inherited: metadata.value.schema == null,
      noOp: false,
      createdUnder,
      retainCurrentRevision,
      validation,
    },
  };
}

export async function previewSchemaHandoff(
  root: string,
  change: string,
  destinationSchema: string,
): Promise<ActionResult<SchemaHandoffPreview>> {
  const action: LifecycleAction = "change.schema-handoff";
  let target: ActionTarget | undefined;
  try {
    const plan = await buildHandoffPlan(root, change, destinationSchema);
    target = plan.target;
    const data = plan.data;
    const confirm =
      data.ready && !data.noOp
        ? confirmation(
            action,
            plan.target,
            plan.freshness,
            `Set active change ${data.change} schema pin to ${data.to.name} in ${plan.target.root}; artifact bodies are not converted`,
          )
        : undefined;
    return success(action, "preview", plan.target, data, confirm);
  } catch (error) {
    return fail(action, error, target);
  }
}

export async function handoffChangeSchema(
  root: string,
  change: string,
  destinationSchema: string,
  options: MutationOptions = {},
): Promise<ActionResult<SchemaHandoffPreview | SchemaHandoffReceipt>> {
  const action: LifecycleAction = "change.schema-handoff";
  let target: ActionTarget | undefined;
  try {
    const first = await buildHandoffPlan(root, change, destinationSchema);
    target = first.target;
    if (first.noOp)
      return success(action, "applied", first.target, {
        ...first.data,
        noOp: true,
      });
    if (!first.data.ready) {
      if (!options.applyToken)
        return success(action, "preview", first.target, first.data);
      throw new OpsxError(
        "TARGET_VALIDATION_FAILED",
        `Change ${change} does not satisfy schema ${destinationSchema}; no files were changed.`,
      );
    }
    const confirm = confirmation(
      action,
      first.target,
      first.freshness,
      `Set active change ${change} schema pin to ${destinationSchema} in ${first.target.root}; artifact bodies are not converted`,
    );
    if (!options.applyToken)
      return success(action, "preview", first.target, first.data, confirm);
    const token = readToken(options.applyToken, action, first.target);
    let current: InternalPlan<SchemaHandoffPreview>;
    try {
      current = await buildHandoffPlan(root, change, destinationSchema);
    } catch (error) {
      throw new OpsxError(
        "STALE_PREVIEW",
        `Schema handoff preview for ${change} is stale: ${error instanceof Error ? error.message : String(error)}. Request a new preview.`,
      );
    }
    if (token.freshness !== current.freshness)
      throw new OpsxError(
        "STALE_PREVIEW",
        `Schema handoff preview for ${change} is stale; request a new preview.`,
      );
    if (!current.data.ready)
      throw new OpsxError(
        "TARGET_VALIDATION_FAILED",
        `Change ${change} does not satisfy schema ${destinationSchema}; no files were changed.`,
      );

    const rootPath = current.target.root;
    const directory = await changeDirectory(rootPath, change);
    const metadata = await metadataFor(directory);
    const client = new OpenSpecClient(rootPath);
    const sourceRevision = await resolveRevision(
      client,
      current.data.from.name,
    );
    const destinationRevision = await resolveRevision(
      client,
      current.data.to.name,
    );
    if (
      revisionRef(sourceRevision).digest !== current.data.from.digest ||
      revisionRef(destinationRevision).digest !== current.data.to.digest
    )
      throw new OpsxError(
        "STALE_PREVIEW",
        "Schema content changed immediately before handoff.",
      );
    await retainCurrentRevision(
      rootPath,
      change,
      sourceRevision,
      current.data.createdUnder,
    );
    await retainRevision(rootPath, destinationRevision);
    const validation = await runValidationAgainst(
      rootPath,
      change,
      destinationSchema,
    );
    if (!validation.ok)
      throw new OpsxError(
        "TARGET_VALIDATION_FAILED",
        "Target-schema strict validation failed for " +
          change +
          ": " +
          stable(validation.findings),
      );
    await verifyPlanGuards(current, directory);
    await writeMetadata(directory, metadata.bytes, {
      ...metadata.value,
      schema: destinationSchema,
    });
    try {
      await recordMigration(
        rootPath,
        change,
        current.data.from,
        current.data.to,
      );
      const after = await metadataFor(directory);
      if (after.value.schema !== destinationSchema)
        throw new OpsxError(
          "HANDOFF_NOT_CONFIRMED",
          `Change ${change} does not have the requested schema pin after write.`,
        );
    } catch (error) {
      const after = await metadataFor(directory);
      if (after.value.schema === destinationSchema) {
        try {
          await writeMetadata(directory, after.bytes, metadata.value);
        } catch (rollback) {
          throw new OpsxError(
            "HANDOFF_PARTIAL",
            `Handoff failed and pin rollback also failed: ${rollback instanceof Error ? rollback.message : String(rollback)}. Migration finalization error: ${error instanceof Error ? error.message : String(error)}.`,
          );
        }
      }
      throw error;
    }
    return success(action, "applied", current.target, {
      change,
      from: current.data.from,
      to: current.data.to,
      migrated: true,
      validation,
    });
  } catch (error) {
    return fail(action, error, target);
  }
}
