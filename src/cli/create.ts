import path from "node:path";
import { lstat } from "node:fs/promises";
import { OpenSpecClient } from "../openspec/client.ts";
import { OpsxError } from "../domain/project.ts";
import { acquireProjectMutationLock } from "../project-lock.ts";
import { changeDirectory } from "../archive/index.ts";
import {
  readProvenance,
  recordCreation,
  revisionRef,
} from "../provenance/index.ts";
import type { ChangeSelectionAssociation } from "../provenance/index.ts";
import { readSelectionReceipt } from "../switch/index.ts";
import { resolveRevision, retainRevision } from "../revisions/index.ts";
import type { Revision, RevisionRef } from "../revisions/index.ts";
import {
  assertSkillBundleDeclared,
  loadAgentProfileDigest,
  loadSkillBundles,
  previewSkillInstall,
} from "../resources/index.ts";
import type { SkillBundle, SkillInstallHostId } from "../resources/index.ts";
import type { ActionResult, ActionTarget, InternalPlan } from "./shared.ts";
import {
  activeDirectory,
  configuredSchema,
  confirmation,
  digest,
  fail,
  projectRoot,
  readSafe,
  readToken,
  requireRealDirectory,
  safeIdentifier,
  stable,
  success,
} from "./shared.ts";
import type { LifecycleAction, MutationOptions } from "./shared.ts";

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
  assertSkillBundleDeclared(catalog, revision.name, selectedBundle);
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
    schemaName: revision.name,
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
  let release: (() => Promise<void>) | undefined;
  try {
    if (options.applyToken) release = await acquireProjectMutationLock(root);
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
  } finally {
    if (release) await release();
  }
}
