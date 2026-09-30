import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { changeDirectory } from "../../archive/index.ts";
import {
  changeHistory,
  readProvenance,
  revisionRef,
} from "../../provenance/index.ts";
import { checkRevision, resolveRevision } from "../../revisions/index.ts";
import type { RevisionRef } from "../../revisions/index.ts";
import { OpsxError } from "../project.ts";
import { OpenSpecClient } from "../../openspec/client.ts";
import {
  loadAgentProfileDigest,
  loadSkillBundles,
} from "../../resources/index.ts";
import type {
  ActiveSkillPin,
  ResourceRuntimeOptions,
} from "../../resources/index.ts";

export function samePinnedRevision(
  left: RevisionRef,
  right: RevisionRef,
): boolean {
  const a = left.bundleSource;
  const b = right.bundleSource;
  return (
    left.name === right.name &&
    left.source === right.source &&
    left.digest === right.digest &&
    ((!a && !b) ||
      Boolean(
        a &&
          b &&
          a.name === b.name &&
          a.version === b.version &&
          a.revision === b.revision &&
          a.digest === b.digest,
      ))
  );
}

async function verifiedActiveSkillPins(
  root: string,
): Promise<readonly ActiveSkillPin[]> {
  const directory = path.join(root, "openspec", "changes");
  let info;
  try {
    info = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new OpsxError(
      "RESOURCE_PIN_SCAN_FAILED",
      "Active change directory is unsafe.",
    );
  const client = new OpenSpecClient(root);
  const pins: ActiveSkillPin[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "archive") continue;
    if (entry.isSymbolicLink())
      throw new OpsxError(
        "RESOURCE_PIN_SCAN_FAILED",
        "Cannot inspect symlinked active change " + entry.name + ".",
      );
    if (!entry.isDirectory()) continue;
    const history = await changeHistory(root, entry.name);
    const provenance = await readProvenance(
      await changeDirectory(root, entry.name),
    );
    const association = provenance?.association;
    const latest =
      provenance?.migrations.at(-1)?.to ??
      provenance?.retained ??
      provenance?.created;
    if (!association) {
      const revision = await resolveRevision(client, history.currentSchema);
      if (
        history.divergence ||
        revision.shadows.length > 0 ||
        (latest &&
          (history.currentSchema !== latest.name ||
            !samePinnedRevision(latest, revisionRef(revision)) ||
            (await checkRevision(root, latest, client)).state !== "intact"))
      ) {
        throw new OpsxError(
          "RESOURCE_PIN_REVISION_CHANGED",
          "Active change " +
            entry.name +
            " does not match its recorded schema revision.",
        );
      }
      const bundles = await loadSkillBundles(revision.source);
      if (
        Object.values(bundles.declarations).some(
          (declarations) => declarations.length > 0,
        )
      ) {
        throw new OpsxError(
          "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
          "Active change " +
            entry.name +
            " has no verified skill selection; disabling skills is blocked.",
        );
      }
      continue;
    }
    if (
      !latest ||
      history.divergence ||
      history.currentSchema !== association.effectiveRevision.name ||
      !samePinnedRevision(latest, association.effectiveRevision)
    ) {
      throw new OpsxError(
        "RESOURCE_PIN_REVISION_CHANGED",
        "Active change " +
          entry.name +
          " does not match its recorded skill-selection revision.",
      );
    }
    const revision = association.effectiveRevision;
    if ((await checkRevision(root, revision, client)).state !== "intact") {
      throw new OpsxError(
        "RESOURCE_PIN_REVISION_CHANGED",
        "Active change " +
          entry.name +
          " no longer resolves to its retained schema revision.",
      );
    }
    const bundles = await loadSkillBundles(revision.source);
    if (
      association.manifestDigests.agentProfiles !==
        (await loadAgentProfileDigest()) ||
      association.manifestDigests.schemaSkills !==
        bundles.manifestDigests.skills ||
      association.manifestDigests.skillBundles !==
        bundles.manifestDigests.profiles
    ) {
      throw new OpsxError(
        "RESOURCE_PIN_MANIFEST_CHANGED",
        "Active change " +
          entry.name +
          " skill-selection manifests changed; disabling skills is blocked.",
      );
    }
    pins.push({
      change: entry.name,
      schema: revision.name,
      revisionDigest: revision.digest,
      schemaRoot: revision.source,
      profiles: association.profiles,
      skillHosts: association.skillHosts,
      skillBundle: association.skillBundle,
    });
  }
  return pins;
}

export const verifiedPinOptions: ResourceRuntimeOptions = {
  resolveActivePins: verifiedActiveSkillPins,
};
