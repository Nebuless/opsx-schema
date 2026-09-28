import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { changeDirectory } from "../archive/index.ts";
import { OpsxError, resolveProject } from "../domain/project.ts";
import { OpenSpecClient } from "../openspec/client.ts";
import type { OpenSpecCommandResult } from "../openspec/client.ts";
import {
  changeHistory,
  readProvenance,
  type Provenance,
} from "../provenance/index.ts";
import {
  checkRevision,
  inspectRetainedRevision,
  resolveRevision,
} from "../revisions/index.ts";
import type {
  Revision,
  RevisionCheck,
  RevisionRef,
} from "../revisions/index.ts";

export interface ValidationFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  change: string;
  schema: string;
  findings: ValidationFinding[];
}

interface Context {
  root: string;
  change: string;
  directory: string;
  schema: string;
  revision?: RevisionRef;
  client: OpenSpecClient;
  findings: ValidationFinding[];
  blocked: boolean;
}

type SchemaSource =
  | { kind: "current"; revision: Revision }
  | { kind: "retained"; revision: RevisionRef }
  | { kind: "directory"; root: string };

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MAX_COPIED_ENTRIES = 2_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function latestRevision(
  provenance: Provenance | null,
): RevisionRef | undefined {
  return (
    provenance?.migrations.at(-1)?.to ??
    provenance?.retained ??
    provenance?.created ??
    undefined
  );
}

function revisionFor(
  provenance: Provenance | null,
  name: string,
): RevisionRef | undefined {
  if (!provenance) return undefined;
  const candidates = [
    provenance.migrations.at(-1)?.to,
    provenance.retained,
    provenance.created,
    ...provenance.migrations.flatMap((migration) => [
      migration.to,
      migration.from,
    ]),
  ];
  return candidates.find(
    (candidate): candidate is RevisionRef => candidate?.name === name,
  );
}

function add(
  context: Context,
  finding: ValidationFinding,
  blocks = true,
): void {
  context.findings.push(finding);
  if (blocks) context.blocked = true;
}

function reportShadows(
  context: Context,
  change: string,
  revision: Revision | undefined,
): void {
  if (!revision?.shadows.length) return;
  add(
    context,
    {
      code: "SCHEMA_SHADOWS_PRESENT",
      severity: "warning",
      message: `OpenSpec reports ${revision.shadows.length} shadowed schema source(s); the selected source is ${revision.source}.`,
      path: projectPath(change, ".openspec.yaml"),
    },
    false,
  );
}

function projectPath(change: string, relative?: string): string {
  if (!SAFE_NAME.test(change)) return "openspec/changes";
  return path.posix.join(
    "openspec",
    "changes",
    change,
    ...(relative ? relative.split(/[\\/]+/) : []),
  );
}

function safeArtifactPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || value.includes("*"))
    return undefined;
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized
      .split("/")
      .some((part) => part === ".." || part === "." || part === "")
  )
    return undefined;
  return normalized;
}

function openSpecIssuePath(
  change: string,
  issuePath: unknown,
): string | undefined {
  if (
    typeof issuePath !== "string" ||
    !issuePath.trim() ||
    issuePath === "file"
  )
    return undefined;
  const normalized = issuePath.replaceAll("\\", "/");
  if (
    path.isAbsolute(normalized) ||
    normalized.split("/").some((part) => part === "..")
  )
    return undefined;
  const relative =
    normalized.startsWith("specs/") ||
    ["proposal.md", "design.md", "tasks.md"].includes(normalized)
      ? normalized
      : path.posix.join("specs", normalized);
  return projectPath(change, relative);
}

function readValidationResult(
  change: string,
  result: OpenSpecCommandResult,
  context: Context,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    const detail =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `OpenSpec exited with status ${result.status}.`;
    add(context, {
      code: "OPENSPEC_RESULT_UNKNOWN",
      severity: "warning",
      message: `Could not interpret OpenSpec 1.12.0 validation output: ${detail}`,
      path: projectPath(change),
    });
    return;
  }

  const payload = asRecord(parsed);
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  const item =
    items
      .map(asRecord)
      .find((value) => value?.id === change && value.type === "change") ??
    items.map(asRecord).find((value) => value?.type === "change");
  if (!item || typeof item.valid !== "boolean") {
    add(context, {
      code: "OPENSPEC_RESULT_UNKNOWN",
      severity: "warning",
      message:
        "OpenSpec returned JSON without a recognizable change-validation result.",
      path: projectPath(change),
    });
    return;
  }

  const issues = Array.isArray(item.issues)
    ? item.issues
        .map(asRecord)
        .filter(
          (value): value is Record<string, unknown> => value !== undefined,
        )
    : [];
  for (const issue of issues) {
    const level =
      typeof issue.level === "string" ? issue.level.toUpperCase() : "ERROR";
    const severity =
      level === "WARNING" || level === "WARN" ? "warning" : "error";
    const message =
      typeof issue.message === "string"
        ? issue.message
        : "OpenSpec reported a validation issue.";
    const issuePath = openSpecIssuePath(change, issue.path);
    add(
      context,
      {
        code: severity === "error" ? "OPENSPEC_INVALID" : "OPENSPEC_WARNING",
        severity,
        message,
        path: issuePath ?? projectPath(change),
      },
      severity === "error",
    );
  }
  if (
    item.valid === false &&
    !issues.some(
      (issue) =>
        typeof issue.level === "string" &&
        issue.level.toUpperCase() !== "WARNING" &&
        issue.level.toUpperCase() !== "WARN",
    )
  ) {
    add(context, {
      code: "OPENSPEC_INVALID",
      severity: "error",
      message: "OpenSpec strict validation rejected the change.",
      path: projectPath(change),
    });
  }
  if (result.status !== 0 && item.valid === true) {
    add(context, {
      code: "OPENSPEC_EXIT_FAILURE",
      severity: "error",
      message: `OpenSpec strict validation exited with status ${result.status}.`,
      path: projectPath(change),
    });
  }
}

async function copyTree(
  source: string,
  destination: string,
  counter = { entries: 0 },
): Promise<void> {
  const info = await lstat(source);
  if (info.isSymbolicLink())
    throw new OpsxError(
      "VALIDATION_UNSAFE",
      `Refusing to follow symlink in validation input: ${source}`,
    );
  if (info.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      counter.entries += 1;
      if (counter.entries > MAX_COPIED_ENTRIES)
        throw new OpsxError(
          "VALIDATION_LIMIT",
          "Validation input contains too many entries.",
        );
      await copyTree(
        path.join(source, entry.name),
        path.join(destination, entry.name),
        counter,
      );
    }
    return;
  }
  if (!info.isFile())
    throw new OpsxError(
      "VALIDATION_UNSAFE",
      `Unsupported validation input: ${source}`,
    );
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function copyRetainedRevision(
  root: string,
  revision: RevisionRef,
  destination: string,
): Promise<void> {
  const snapshot = await inspectRetainedRevision(root, revision);
  await mkdir(destination, { recursive: true });
  for (const relative of snapshot.files) {
    const file = await inspectRetainedRevision(root, revision, relative);
    const output = path.join(destination, ...relative.split("/"));
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, file.content, { flag: "wx" });
  }
}

async function copyProjectSpecs(
  root: string,
  destination: string,
): Promise<void> {
  try {
    await copyTree(path.join(root, "openspec", "specs"), destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function buildFixture(
  context: Context,
  change: string,
  schemaName: string,
  source: SchemaSource,
): Promise<string> {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "opsx-validation-"),
  );
  try {
    const openspecRoot = path.join(temporaryRoot, "openspec");
    const schemaTarget = path.join(openspecRoot, "schemas", schemaName);
    const changeTarget = path.join(openspecRoot, "changes", change);
    await mkdir(path.join(openspecRoot, "changes"), { recursive: true });
    await mkdir(path.join(openspecRoot, "schemas"), { recursive: true });
    await writeFile(
      path.join(openspecRoot, "config.yaml"),
      YAML.stringify({ schema: schemaName }),
      { flag: "wx" },
    );
    if (source.kind === "retained")
      await copyRetainedRevision(context.root, source.revision, schemaTarget);
    else
      await copyTree(
        source.kind === "current" ? source.revision.source : source.root,
        schemaTarget,
      );
    await copyProjectSpecs(context.root, path.join(openspecRoot, "specs"));
    await copyTree(context.directory, changeTarget);

    const metadataPath = path.join(changeTarget, ".openspec.yaml");
    let metadata: Record<string, unknown> = {};
    try {
      const parsed = YAML.parse(await readFile(metadataPath, "utf8"));
      const value = asRecord(parsed);
      if (parsed !== null && parsed !== undefined && !value)
        throw new OpsxError(
          "CHANGE_METADATA",
          "Change metadata must be a mapping.",
        );
      metadata = value ?? {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    metadata.schema = schemaName;
    await writeFile(metadataPath, YAML.stringify(metadata), { flag: "w" });
    return temporaryRoot;
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function prepareContext(root: string, change: string): Promise<Context> {
  const context: Context = {
    root,
    change,
    directory: "",
    schema: "Unknown",
    client: new OpenSpecClient(root),
    findings: [],
    blocked: false,
  };
  const fail = (code: string, message: string, filePath?: string) =>
    add(context, {
      code,
      severity: "error",
      message,
      ...(filePath ? { path: filePath } : {}),
    });
  try {
    context.root = await resolveProject(root, true);
    context.directory = await changeDirectory(context.root, change);
    const history = await changeHistory(context.root, change);
    const provenance = await readProvenance(context.directory);
    const latest = latestRevision(provenance);
    context.schema = history.inherited
      ? (latest?.name ?? history.currentSchema)
      : history.currentSchema;
    context.revision = revisionFor(provenance, context.schema);
    context.client = new OpenSpecClient(context.root);
    context.client.ensureSupported();

    if (context.schema === "Unknown" || !SAFE_NAME.test(context.schema)) {
      fail(
        "SCHEMA_UNKNOWN",
        "The change's effective schema could not be resolved.",
        projectPath(change),
      );
      return context;
    }
    if (!provenance || !context.revision) {
      add(context, {
        code: "PROVENANCE_UNKNOWN",
        severity: "warning",
        message: `The exact ${context.schema} revision for ${change} is not recorded; validation can only use the currently resolved schema.`,
        path: projectPath(change, ".opsx-provenance.json"),
      });
    }
    if (!history.inherited && latest && latest.name !== history.currentSchema) {
      fail(
        "PROVENANCE_DIVERGENCE",
        history.divergence ??
          `Recorded revision ${latest.name} differs from pinned schema ${history.currentSchema}.`,
        projectPath(change, ".openspec.yaml"),
      );
    }
    return context;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof OpsxError && error.code === "CHANGE_NOT_FOUND"
        ? "CHANGE_NOT_FOUND"
        : "VALIDATION_INPUT_UNKNOWN";
    fail(code, message, projectPath(change));
    return context;
  }
}

async function checkPinnedRevision(
  context: Context,
  change: string,
): Promise<RevisionCheck | undefined> {
  if (!context.revision) return undefined;
  try {
    const checked = await checkRevision(
      context.root,
      context.revision,
      context.client,
    );
    if (!checked.retained) {
      add(context, {
        code: "SCHEMA_REVISION_MISSING",
        severity: "error",
        message: `The pinned ${context.revision.name} revision has no intact retained snapshot; refusing to substitute a same-name schema.`,
        path: `openspec/.opsx/revisions/${context.revision.name}/${context.revision.digest}`,
      });
    }
    if (checked.state === "missing") {
      add(context, {
        code: "SCHEMA_REVISION_MISSING",
        severity: "error",
        message: `The pinned schema revision ${context.revision.name} is no longer resolvable.`,
        path: projectPath(change, ".openspec.yaml"),
      });
    } else if (checked.state === "drift") {
      add(context, {
        code: "SCHEMA_REVISION_DRIFT",
        severity: "error",
        message: `The current ${context.revision.name} schema differs from the revision pinned by this change.`,
        path: projectPath(change, ".openspec.yaml"),
      });
    } else if (checked.state === "shadow") {
      add(context, {
        code: "SCHEMA_REVISION_SHADOW",
        severity: "error",
        message: `The ${context.revision.name} schema now resolves from a different source than the pinned revision.`,
        path: projectPath(change, ".openspec.yaml"),
      });
    }
    reportShadows(context, change, checked.revision);
    return checked;
  } catch (error) {
    add(context, {
      code: "SCHEMA_REVISION_UNKNOWN",
      severity: "warning",
      message: `Could not verify the pinned schema revision: ${error instanceof Error ? error.message : String(error)}`,
      path: projectPath(change, ".openspec.yaml"),
    });
    return undefined;
  }
}

function readStatus(
  change: string,
  schemaName: string,
  status: unknown,
  context: Context,
): void {
  const value = asRecord(status);
  if (
    !value ||
    value.changeName !== change ||
    typeof value.schemaName !== "string" ||
    !Array.isArray(value.artifacts) ||
    typeof value.isPlanningComplete !== "boolean"
  ) {
    add(context, {
      code: "WORKFLOW_UNKNOWN",
      severity: "warning",
      message: "OpenSpec status returned an unrecognized workflow result.",
      path: projectPath(change),
    });
    return;
  }
  if (value.schemaName !== schemaName) {
    add(context, {
      code: "SCHEMA_RESOLUTION_MISMATCH",
      severity: "error",
      message: `OpenSpec selected ${value.schemaName} in the isolated validation project instead of ${schemaName}.`,
      path: projectPath(change, ".openspec.yaml"),
    });
    return;
  }
  if (value.isPlanningComplete !== true) {
    const incomplete = value.artifacts
      .map(asRecord)
      .filter(
        (artifact): artifact is Record<string, unknown> =>
          artifact !== undefined,
      )
      .filter(
        (artifact) =>
          artifact.status !== "done" && artifact.status !== "complete",
      );
    const names = incomplete
      .map((artifact) =>
        typeof artifact.id === "string" ? artifact.id : undefined,
      )
      .filter(Boolean);
    const artifactPaths = asRecord(value.artifactPaths);
    const firstMissing = incomplete.find((artifact) => {
      const id = typeof artifact.id === "string" ? artifact.id : "";
      const paths = asRecord(artifactPaths?.[id]);
      return (
        Array.isArray(paths?.existingOutputPaths) &&
        paths.existingOutputPaths.length === 0
      );
    });
    const firstMissingId =
      typeof firstMissing?.id === "string" ? firstMissing.id : "";
    const outputPath = asRecord(artifactPaths?.[firstMissingId])?.outputPath;
    const pathValue = safeArtifactPath(outputPath);
    add(context, {
      code: "WORKFLOW_INCOMPLETE",
      severity: "error",
      message: `OpenSpec planning is incomplete${names.length ? `; pending artifacts: ${names.join(", ")}` : ""}.`,
      path: projectPath(change, pathValue),
    });
  }
}

async function runGate(
  context: Context,
  targetSchema?: string,
  targetSchemaRoot?: string,
): Promise<ValidationResult> {
  const change = context.change;
  const schemaName = targetSchema ?? context.schema;
  if (!SAFE_NAME.test(schemaName) || schemaName === "Unknown") {
    add(context, {
      code: "SCHEMA_UNKNOWN",
      severity: "error",
      message: `Invalid or unresolved schema name: ${schemaName}.`,
      path: projectPath(change),
    });
    return {
      ok: false,
      change,
      schema: schemaName,
      findings: context.findings,
    };
  }

  let source: SchemaSource;
  try {
    if (targetSchema === undefined) {
      const checked = context.revision
        ? await checkPinnedRevision(context, change)
        : undefined;
      if (context.revision && (!checked || !checked.retained)) {
        return {
          ok: false,
          change,
          schema: schemaName,
          findings: context.findings,
        };
      }
      if (context.revision) {
        source = { kind: "retained", revision: context.revision };
      } else {
        const revision = await resolveRevision(context.client, schemaName);
        reportShadows(context, change, revision);
        source = { kind: "current", revision };
      }
    } else {
      const checked = context.revision
        ? await checkPinnedRevision(context, change)
        : undefined;
      if (context.revision && (!checked || !checked.retained)) {
        return {
          ok: false,
          change,
          schema: schemaName,
          findings: context.findings,
        };
      }
      if (targetSchemaRoot !== undefined) {
        source = {
          kind: "directory",
          root: path.isAbsolute(targetSchemaRoot)
            ? targetSchemaRoot
            : path.resolve(context.root, targetSchemaRoot),
        };
      } else {
        const targetRevision = await resolveRevision(
          context.client,
          schemaName,
        );
        if (targetRevision.name !== context.revision?.name)
          reportShadows(context, change, targetRevision);
        source = { kind: "current", revision: targetRevision };
      }
    }
  } catch (error) {
    add(context, {
      code: "SCHEMA_UNKNOWN",
      severity: "error",
      message: `Could not resolve schema ${schemaName}: ${error instanceof Error ? error.message : String(error)}`,
      path: projectPath(change, ".openspec.yaml"),
    });
    return {
      ok: false,
      change,
      schema: schemaName,
      findings: context.findings,
    };
  }

  let temporaryRoot: string | undefined;
  try {
    temporaryRoot = await buildFixture(context, change, schemaName, source);
    const isolatedClient = new OpenSpecClient(temporaryRoot);
    let status: unknown;
    try {
      status = await isolatedClient.json<unknown>("status", "--change", change);
    } catch (error) {
      add(context, {
        code: "WORKFLOW_UNKNOWN",
        severity: "warning",
        message: `Could not read OpenSpec workflow status: ${error instanceof Error ? error.message : String(error)}`,
        path: projectPath(change),
      });
    }
    if (status !== undefined) readStatus(change, schemaName, status, context);

    const result = await new OpenSpecClient(temporaryRoot).commandResult(
      "validate",
      change,
      "--type",
      "change",
      "--strict",
      "--json",
      "--no-interactive",
    );
    readValidationResult(change, result, context);
  } catch (error) {
    add(context, {
      code: "VALIDATION_UNKNOWN",
      severity: "warning",
      message: `Could not complete isolated OpenSpec validation: ${error instanceof Error ? error.message : String(error)}`,
      path: projectPath(change),
    });
  } finally {
    if (temporaryRoot)
      await rm(temporaryRoot, { recursive: true, force: true });
  }

  return {
    ok: !context.blocked,
    change,
    schema: schemaName,
    findings: context.findings,
  };
}

/** Validate a change against its exact effective pinned revision without modifying the project. */
export async function validateChange(
  root: string,
  name: string,
): Promise<ValidationResult> {
  return runGate(await prepareContext(root, name));
}

export interface ValidateChangeAgainstOptions {
  targetSchemaRoot?: string;
}

/** Preflight a change against a destination schema in an isolated OpenSpec project. */
export async function validateChangeAgainst(
  root: string,
  name: string,
  targetSchema: string,
  options: ValidateChangeAgainstOptions = {},
): Promise<ValidationResult> {
  return runGate(
    await prepareContext(root, name),
    targetSchema,
    options.targetSchemaRoot,
  );
}
