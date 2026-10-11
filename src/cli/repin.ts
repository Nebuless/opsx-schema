import { OpsxError } from "../domain/project.ts";
import { OpenSpecClient } from "../openspec/client.ts";
import {
  effectiveAssociation,
  effectiveRevision,
  hasPairedAssociationHistory,
  readProvenance,
} from "../provenance/index.ts";
import {
  checkRevision,
  inspectRetainedRevision,
  resolveRevision,
} from "../revisions/index.ts";
import {
  inspectSelectedSkillOwnership,
  loadAgentProfileDigest,
  loadSkillBundles,
  previewSkillInstall,
} from "../resources/index.ts";
import type {
  ResourceRuntimeOptions,
  SkillBundle,
  SkillInstallHostId,
} from "../resources/index.ts";
import { assertNoIncompleteSwitchRecovery } from "../switch/recovery.ts";
import { validateChangeAgainst } from "../validation/index.ts";
import {
  activeDirectory,
  confirmation,
  digest,
  fail,
  metadataFor,
  projectRoot,
  safeIdentifier,
  stable,
  success,
} from "./shared.ts";
import type { ActionResult, ActionTarget, LifecycleAction } from "./shared.ts";
const action: LifecycleAction = "change.re-pin";
const unknownOriginWarning =
  "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.";
export interface RePinSelection {
  profiles: string[];
  noProfiles: boolean;
  skillHosts: SkillInstallHostId[];
  bundle?: SkillBundle;
}
export interface RePinPreview {
  ready: boolean;
  change: string;
  from: import("../revisions/index.ts").RevisionRef;
  to: import("../revisions/index.ts").RevisionRef;
  noOp: boolean;
  validation: import("../validation/index.ts").ValidationResult;
  historicalOrigin?: {
    status: "unknown";
    oldLocation: string;
    currentLocation: string;
    warning: string;
  };
}
export async function previewChangeRePin(
  rootInput: string,
  changeInput: string,
  schemaInput: string,
  selection: RePinSelection,
  refused?: "apply" | "recover",
  resourceOptions: ResourceRuntimeOptions = {},
): Promise<ActionResult<RePinPreview>> {
  let target: ActionTarget | undefined;
  try {
    const root = await projectRoot(rootInput),
      change = safeIdentifier(changeInput, "change name"),
      schemaName = safeIdentifier(schemaInput, "schema name");
    target = { root, change, schema: schemaName };
    if (refused)
      throw new OpsxError(
        "REPIN_NOT_IMPLEMENTED",
        (refused === "apply" ? "--apply-token" : "--recover") +
          " is refused until its implementation task.",
      );
    if (selection.noProfiles && selection.profiles.length)
      throw new OpsxError(
        "USAGE",
        "--profile and --no-profiles cannot be combined.",
      );
    if (
      new Set(selection.profiles).size !== selection.profiles.length ||
      new Set(selection.skillHosts).size !== selection.skillHosts.length
    )
      throw new OpsxError(
        "USAGE",
        "Duplicate profile or skill-host selections are not allowed.",
      );
    const directory = await activeDirectory(root, change),
      metadata = await metadataFor(directory);
    await assertNoIncompleteSwitchRecovery(root, [root]);
    if (!metadata.exists || metadata.value.schema !== schemaName)
      throw new OpsxError(
        "REPIN_EXPLICIT_PIN_REQUIRED",
        "Change must have an explicit existing schema pin exactly matching the requested name.",
      );
    const provenance = await readProvenance(directory),
      from = provenance && effectiveRevision(provenance);
    if (provenance?.version === 1 && hasPairedAssociationHistory(provenance))
      throw new OpsxError(
        "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
        "Ambiguous paired version-one association history cannot be extended.",
      );
    if (!from || from.name !== schemaName)
      throw new OpsxError(
        "PROVENANCE_UNKNOWN",
        "Known effective same-name provenance is required; ambiguous history is not repairable here.",
      );
    const client = new OpenSpecClient(root),
      to = await resolveRevision(client, schemaName);
    if (!to.origin)
      throw new OpsxError(
        "REPIN_TARGET_UNWITNESSED",
        "Re-pin requires a witnessed Git-tracked project-local schema target.",
      );
    if (to.shadows.length)
      throw new OpsxError(
        "SCHEMA_AMBIGUOUS",
        "Target schema has a genuine same-name shadow.",
      );
    if (from.digest !== to.digest)
      throw new OpsxError(
        "REVISION_DRIFT",
        "Target schema digest differs from the effective pin.",
      );
    if (stable(from.bundleSource ?? null) !== stable(to.bundleSource ?? null))
      throw new OpsxError(
        "BUNDLE_MISMATCH",
        "Target bundle identity differs from the recorded revision.",
      );
    const retained = await inspectRetainedRevision(root, from),
      check = await checkRevision(root, from, client, {
        reviewedHistoricalOrigin: true,
      });
    if (!check.retained)
      throw new OpsxError("REVISION_DRIFT", "Retained revision is not intact.");
    if (check.state !== "intact" && !check.historicalOriginMismatchOnly)
      throw new OpsxError(
        "REVISION_" + check.state.toUpperCase(),
        "Pinned revision has an unresolved " + check.state + " finding.",
      );
    if (check.revision?.shadows.length)
      throw new OpsxError(
        "SCHEMA_AMBIGUOUS",
        "Resolved target has a genuine same-name shadow.",
      );
    const association = effectiveAssociation(provenance);
    let resources: unknown = null;
    if (association) {
      const profiles = selection.noProfiles ? [] : selection.profiles;
      if (!selection.bundle || (!selection.noProfiles && !profiles.length))
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
          "Associated changes require --bundle and an explicit profile selection or --no-profiles.",
        );
      if (
        association.skillBundle !== selection.bundle ||
        association.profiles.slice().sort().join("|") !==
          profiles.slice().sort().join("|") ||
        association.skillHosts.slice().sort().join("|") !==
          selection.skillHosts.slice().sort().join("|")
      )
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_MISMATCH",
          "Selection must exactly match the existing compatible association.",
        );
      const catalog = await loadSkillBundles(to.source);
      const emptySelection =
        profiles.length === 0 && selection.skillHosts.length === 0;
      if (
        (catalog.declarations[selection.bundle]?.length ?? 0) > 0 &&
        emptySelection
      )
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_MISMATCH",
          "A skill-bearing association requires selected installed targets.",
        );
      const plan = emptySelection
        ? null
        : await previewSkillInstall(
            {
              projectRoot: root,
              schemaRoot: to.source,
              schemaName,
              profiles,
              skillHosts: selection.skillHosts,
              skillBundle: selection.bundle,
            },
            resourceOptions,
          );
      if (
        plan &&
        (plan.diagnostics.length ||
          plan.targets.some((x) => x.action !== "noop") ||
          plan.skillHosts.some(
            (host) =>
              selection.skillHosts.includes(host.host) &&
              (host.action === "refuse" ||
                host.targets.some((item) => item.action !== "noop")),
          ) ||
          !(await inspectSelectedSkillOwnership(plan)))
      )
        throw new OpsxError(
          "RESOURCE_OWNERSHIP_INVALID",
          "Selected targets are not intact and owned.",
        );
      const manifestDigests = plan?.manifestDigests ?? {
        agentProfiles: await loadAgentProfileDigest(),
        schemaSkills: catalog.manifestDigests.skills,
        skillBundles: catalog.manifestDigests.profiles,
      };
      if (
        stable(association.manifestDigests) !== stable(manifestDigests) ||
        !catalog.bundles.includes(selection.bundle)
      )
        throw new OpsxError(
          "PROVENANCE_ASSOCIATION_MISMATCH",
          "Selection must exactly match the existing compatible association and manifests.",
        );
      resources = plan
        ? {
            targets: plan.targets,
            skillHosts: plan.skillHosts,
            manifestDigests,
          }
        : { targets: [], skillHosts: [], manifestDigests };
    } else if (
      selection.bundle ||
      selection.profiles.length ||
      selection.skillHosts.length ||
      selection.noProfiles
    )
      throw new OpsxError(
        "USAGE",
        "Selection flags are only valid for associated changes.",
      );
    const validation = await validateChangeAgainst(root, change, schemaName, {
      targetSchemaRoot: to.source,
      reviewedHistoricalOrigin: { recorded: from, target: to },
    });
    if (!validation.ok || validation.strictWorkflowValidated !== true)
      throw new OpsxError(
        "VALIDATION_FAILED",
        "Strict workflow validation failed: " +
          validation.findings
            .filter((item) => item.severity === "error")
            .map((item) => item.code + ": " + item.message)
            .join("; "),
      );
    const historicalOrigin = check.historicalOriginUnverified
      ? {
          status: "unknown" as const,
          oldLocation: from.source,
          currentLocation: to.source,
          warning: unknownOriginWarning,
        }
      : undefined;
    const noOp = check.state === "intact",
      data = {
        ready: true,
        change,
        from,
        to,
        noOp,
        validation,
        ...(historicalOrigin ? { historicalOrigin } : {}),
        retainedFiles: retained.files.length,
        resources,
      };
    return success(
      action,
      "preview",
      target,
      data,
      !noOp
        ? confirmation(
            action,
            target,
            digest(
              stable({
                provenance,
                pin: metadata.bytes?.toString("base64"),
                to,
                validation,
                resources,
                historicalOrigin: historicalOrigin ?? null,
              }),
            ),
            historicalOrigin
              ? `${historicalOrigin.warning}\nOld location: ${historicalOrigin.oldLocation}\nVerified current location: ${historicalOrigin.currentLocation}`
              : "Review same-name re-pin " + change + " to " + schemaName,
          )
        : undefined,
    );
  } catch (error) {
    return fail(action, error, target);
  }
}
