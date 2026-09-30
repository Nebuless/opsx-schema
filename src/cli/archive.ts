import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";
import { changeDirectory, listArchived } from "../archive/index.ts";
import { withProjectMutationLock } from "../project-lock.ts";
import { resolveRevision } from "../revisions/index.ts";
import type { RevisionRef } from "../revisions/index.ts";
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
  readToken,
  retainCurrentRevision,
  runValidation,
  safeIdentifier,
  stable,
  statusFor,
  success,
  verifyPlanGuards,
} from "./shared.ts";
import type { LifecycleAction, MutationOptions } from "./shared.ts";

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
    return await withProjectMutationLock(first.target.root, async () => {
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
      if (
        stable(await statusFor(client, change)) !== stable(current.data.status)
      )
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
    });
  } catch (error) {
    return fail(action, error, target);
  }
}
