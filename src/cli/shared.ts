import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError, resolveProject } from "../domain/project.ts";
import { changeDirectory } from "../archive/index.ts";
import {
  readProvenance,
  revisionRef,
  retainLegacy,
} from "../provenance/index.ts";
import { checkRevision, retainRevision } from "../revisions/index.ts";
import type { Revision, RevisionRef } from "../revisions/index.ts";
import type { ValidationResult } from "../validation/index.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const JSON_VERSION = 1;

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
export interface MutationOptions {
  applyToken?: string;
}
interface TokenPayload {
  version: 1;
  action: LifecycleAction;
  target: ActionTarget;
  freshness: string;
}
export interface InternalPlan<T> {
  target: ActionTarget;
  data: T;
  freshness: string;
  noOp?: boolean;
  guards?: { tree: string; metadata: string | null; config: string };
}

export async function runValidation(
  root: string,
  change: string,
): Promise<ValidationResult> {
  const validation = await import("../validation/index.ts");
  return validation.validateChange(root, change);
}

export function fail(
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

export function success<T>(
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

export function safeIdentifier(value: string, kind: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value))
    throw new OpsxError("UNSAFE_PATH", `Unsafe ${kind}: ${String(value)}`);
  return value;
}

export function stable(value: unknown): string {
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

export function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function makeToken(
  action: LifecycleAction,
  target: ActionTarget,
  freshness: string,
): string {
  const payload: TokenPayload = { version: 1, action, target, freshness };
  const encoded = Buffer.from(stable(payload)).toString("base64url");
  return `opsx-preview-v1.${encoded}.${digest(encoded)}`;
}

export function readToken(
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

export function confirmation(
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

export async function projectRoot(root: string): Promise<string> {
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

export async function requireRealDirectory(
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

export async function requireRealFile(
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
  if (!info.isFile() || info.isSymbolicLink())
    throw new OpsxError(
      "UNSAFE_PATH",
      `${label} must be a regular file: ${file}`,
    );
}

export async function readSafe(file: string, label = file): Promise<Buffer> {
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

export async function configuredSchema(root: string): Promise<string> {
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

export async function activeDirectory(
  root: string,
  change: string,
): Promise<string> {
  safeIdentifier(change, "change name");
  await requireRealDirectory(
    path.join(root, "openspec", "changes"),
    "Active changes directory",
  );
  return changeDirectory(root, change);
}

export async function fingerprintTree(
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

export async function statusFor(
  client: OpenSpecClient,
  change: string,
): Promise<unknown> {
  return client.json("status", "--change", change);
}

export async function metadataFor(directory: string): Promise<{
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

export async function readConfigFingerprint(root: string): Promise<string> {
  return digest(
    await readSafe(
      path.join(root, "openspec", "config.yaml"),
      "OpenSpec project config",
    ),
  );
}

export async function verifyPlanGuards(
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

export async function currentRevisionInfo(
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

export async function retainCurrentRevision(
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
