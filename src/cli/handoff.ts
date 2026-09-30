import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";
import { changeDirectory } from "../archive/index.ts";
import { withProjectMutationLock } from "../project-lock.ts";
import {
  readProvenance,
  recordMigration,
  retainLegacy,
  revisionRef,
} from "../provenance/index.ts";
import type { Provenance } from "../provenance/index.ts";
import { resolveRevision, retainRevision } from "../revisions/index.ts";
import type { Revision, RevisionRef } from "../revisions/index.ts";
import type { ValidationResult } from "../validation/index.ts";
import type { ActionResult, ActionTarget, InternalPlan } from "./shared.ts";
import {
  activeDirectory,
  configuredSchema,
  confirmation,
  currentRevisionInfo,
  digest,
  fail,
  fingerprintTree,
  metadataFor,
  projectRoot,
  readConfigFingerprint,
  readSafe,
  readToken,
  retainCurrentRevision,
  runValidation,
  safeIdentifier,
  stable,
  success,
  verifyPlanGuards,
} from "./shared.ts";
import type { LifecycleAction, MutationOptions } from "./shared.ts";

async function runValidationAgainst(
  root: string,
  change: string,
  schema: string,
): Promise<ValidationResult> {
  const validation = await import("../validation/index.ts");
  return validation.validateChangeAgainst(root, change, schema);
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
    return await withProjectMutationLock(first.target.root, async () => {
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
    });
  } catch (error) {
    return fail(action, error, target);
  }
}
