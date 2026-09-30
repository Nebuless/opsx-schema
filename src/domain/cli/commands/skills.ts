import path from "node:path";
import { withProjectMutationLock } from "../../../project-lock.ts";
import { OpsxError, defaultSchema } from "../../project.ts";
import { OpenSpecClient } from "../../../openspec/client.ts";
import { listBundledSchemas } from "../../../bundled/index.ts";
import { resources } from "../../../catalog/schemas.ts";
import type { ResourceManifest } from "../../../catalog/schemas.ts";
import { changeDirectory } from "../../../archive/index.ts";
import {
  changeHistory,
  readProvenance,
  recordSelectionAssociation,
  revisionRef,
} from "../../../provenance/index.ts";
import { resolveRevision, retainRevision } from "../../../revisions/index.ts";
import {
  assertSkillBundleDeclared,
  applySkillDisable,
  applySkillInstall,
  applySkillReplacement,
  applySkillRestore,
  discoverSkillInstallHosts,
  doctorSkills,
  inspectSkillReplacement,
  isSkillInstallHostId,
  loadAgentProfileDigest,
  loadAgentProfiles,
  loadSkillBundles,
  requiredSkillTargets,
  previewSkillDisable,
  previewSkillInstall,
  previewSkillReplacement,
  previewSkillRestore,
} from "../../../resources/index.ts";
import type {
  SkillBundle,
  SkillDisableRequest,
  SkillInstallHostId,
  SkillInstallRequest,
} from "../../../resources/index.ts";
import {
  applyToken,
  flags,
  many,
  one,
  requireCount,
  skillBundle,
} from "../shared.ts";
import { samePinnedRevision, verifiedPinOptions } from "../skill-pins.ts";

async function skillDetails(
  root: string,
  schemaName: string,
  requestedBundle: SkillBundle,
): Promise<unknown> {
  const client = new OpenSpecClient(root);
  let manifest: ResourceManifest;
  try {
    manifest = await resources(client, schemaName);
  } catch (error) {
    const failurePrefix = `openspec schema which ${schemaName} --json failed: `;
    const response =
      error instanceof Error && error.message.startsWith(failurePrefix)
        ? error.message.slice(failurePrefix.length)
        : "";
    let confirmsMissingSchema = response === `Schema '${schemaName}' not found`;
    if (!confirmsMissingSchema && response) {
      try {
        const parsed: unknown = JSON.parse(response);
        confirmsMissingSchema =
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as Record<string, unknown>).error ===
            `Schema '${schemaName}' not found`;
      } catch {
        confirmsMissingSchema = false;
      }
    }
    if (
      error instanceof OpsxError &&
      error.code === "OPENSPEC_FAILED" &&
      confirmsMissingSchema &&
      listBundledSchemas().includes(schemaName)
    ) {
      throw new OpsxError(
        error.code,
        `${error.message}. This is a bundled schema, not an installed project schema. Run 'schemas bundled ${schemaName}' to inspect it, then 'schemas install ${schemaName} --project <root>' to install it; retry skills inspect after installation.`,
      );
    }
    throw error;
  }
  const profiles = await loadAgentProfiles();
  const schemaRoot = manifest.schema.path;
  const catalog = await loadSkillBundles(schemaRoot);
  const bundles = (["default", "recommended", "all"] as const).map((name) => ({
    name,
    available: catalog.bundles.includes(name),
    declarations: catalog.declarations[name] ?? [],
  }));
  return {
    schema: manifest.schema,
    bundles,
    agentProfiles: profiles,
    skillHosts: await discoverSkillInstallHosts(root),
    requestedBundle,
  };
}

async function reconcileSkillPin(
  root: string,
  change: string,
  digest: string,
  profiles: string[],
  skillHosts: SkillInstallHostId[],
  bundle: SkillBundle,
  supplied?: string,
  locked = false,
): Promise<unknown> {
  if (supplied !== undefined && !locked)
    return withProjectMutationLock(root, () =>
      reconcileSkillPin(
        root,
        change,
        digest,
        profiles,
        skillHosts,
        bundle,
        supplied,
        true,
      ),
    );
  if (!/^[0-9a-f]{64}$/.test(digest))
    throw new OpsxError(
      "USAGE",
      "--revision-digest must be the exact 64-character schema SHA-256.",
    );
  const directory = await changeDirectory(root, change);
  const history = await changeHistory(root, change);
  if (
    history.inherited ||
    history.divergence ||
    history.currentSchema === "Unknown"
  )
    throw new OpsxError(
      "RESOURCE_PIN_REVISION_CHANGED",
      "Reconciliation requires an explicit, unchanged schema pin on an active change.",
    );
  const client = new OpenSpecClient(root);
  const revision = await resolveRevision(client, history.currentSchema);
  if (revision.shadows.length || revision.digest !== digest)
    throw new OpsxError(
      "RESOURCE_PIN_REVISION_CHANGED",
      "The active schema revision differs from the reviewed --revision-digest.",
    );
  const prior = await readProvenance(directory);
  const recorded =
    prior?.migrations.at(-1)?.to ?? prior?.retained ?? prior?.created;
  if (
    prior?.association ||
    (recorded && !samePinnedRevision(recorded, revision))
  )
    throw new OpsxError(
      "RESOURCE_PIN_REVISION_CHANGED",
      "The pin already has an association or its recorded revision differs; inspect provenance before reconciling.",
    );
  const catalog = await loadSkillBundles(revision.source);
  assertSkillBundleDeclared(catalog, revision.name, bundle);
  const declarations = catalog.declarations[bundle] ?? [];
  if (
    declarations.length > 0 &&
    profiles.length === 0 &&
    skillHosts.length === 0
  )
    throw new OpsxError(
      "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
      "Managed skills require an explicit agent profile or native host selection.",
    );
  let manifestDigests: {
    agentProfiles: string;
    schemaSkills: string;
    skillBundles: string | null;
  };
  if (profiles.length === 0 && skillHosts.length === 0) {
    manifestDigests = {
      agentProfiles: await loadAgentProfileDigest(),
      schemaSkills: catalog.manifestDigests.skills,
      skillBundles: catalog.manifestDigests.profiles,
    };
  } else {
    const install = await previewSkillInstall({
      projectRoot: root,
      schemaRoot: revision.source,
      profiles,
      skillHosts,
      skillBundle: bundle,
    });
    if (!install.canApply)
      throw new OpsxError(
        "RESOURCE_RECONCILE_BLOCKED",
        install.diagnostics.map((item) => item.message).join("; "),
      );
    manifestDigests = install.manifestDigests;
  }
  const association = {
    version: 1 as const,
    effectiveRevision: revisionRef(revision),
    profiles: [...profiles].sort(),
    skillHosts: [...skillHosts].sort(),
    skillBundle: bundle,
    manifestDigests,
  };
  const binding = {
    root,
    change,
    revision: association.effectiveRevision,
    association,
    prior,
    pin: history.currentSchema,
  };
  const token = applyToken("skills.reconcile", binding);
  const target = {
    change,
    schema: revision.name,
    revisionDigest: digest,
    provenance: path.join(directory, ".opsx-provenance.json"),
  };
  if (supplied === undefined)
    return {
      phase: "preview",
      target,
      association,
      confirmation: {
        exactTarget: `${change} pinned to ${revision.name}@${digest}; profiles ${association.profiles.join(", ") || "none"}; hosts ${association.skillHosts.join(", ") || "none"}; bundle ${bundle}`,
        token,
      },
    };
  if (supplied !== token)
    throw new OpsxError(
      "APPLY_TOKEN_STALE",
      "The reconciliation token is stale or belongs to another change, revision, or selection; preview again.",
    );
  await retainRevision(root, revision);
  await recordSelectionAssociation(
    root,
    change,
    revisionRef(revision),
    association,
  );
  return { phase: "applied", target, association };
}

export async function commandSkills(
  root: string,
  args: string[],
): Promise<unknown> {
  const [operation, ...rest] = args;
  if (!operation)
    throw new OpsxError(
      "USAGE",
      "Usage: skills <inspect|install|reconcile|replace|restore|disable|doctor> ...",
    );
  if (operation === "doctor") {
    requireCount(rest, 0, 0, "skills doctor");
    return doctorSkills(root, verifiedPinOptions);
  }
  if (operation === "inspect") {
    const parsed = flags(rest, { "--bundle": "one" });
    requireCount(
      parsed.positionals,
      0,
      1,
      "skills inspect [schema] [--bundle default|recommended|all]",
    );
    return skillDetails(
      root,
      parsed.positionals[0] ?? (await defaultSchema(root)),
      skillBundle(one(parsed, "--bundle")),
    );
  }
  if (operation === "reconcile") {
    const parsed = flags(rest, {
      "--revision-digest": "one",
      "--profile": "repeat",
      "--skill-host": "repeat",
      "--bundle": "one",
      "--apply-token": "one",
    });
    requireCount(
      parsed.positionals,
      1,
      1,
      "skills reconcile <change> --revision-digest <sha256> --bundle default|recommended|all [--profile <agent-id> ...] [--skill-host <host> ...] [--apply-token <token>]",
    );
    const digest = one(parsed, "--revision-digest");
    const bundle = one(parsed, "--bundle");
    if (!digest || !bundle)
      throw new OpsxError(
        "USAGE",
        "Reconciliation requires a reviewed --revision-digest and explicit --bundle.",
      );
    const hosts = many(parsed, "--skill-host");
    if (
      hosts.some((host) => !isSkillInstallHostId(host)) ||
      new Set(hosts).size !== hosts.length
    )
      throw new OpsxError(
        "USAGE",
        "Select each supported native host at most once: opencode, omp, pi, atomic, senpi.",
      );
    const profiles = many(parsed, "--profile");
    if (new Set(profiles).size !== profiles.length)
      throw new OpsxError("USAGE", "Select each named profile at most once.");
    return reconcileSkillPin(
      root,
      parsed.positionals[0]!,
      digest,
      profiles,
      hosts as SkillInstallHostId[],
      skillBundle(bundle),
      one(parsed, "--apply-token"),
    );
  }
  if (operation === "install") {
    const parsed = flags(rest, {
      "--profile": "repeat",
      "--skill-host": "repeat",
      "--bundle": "one",
      "--apply-token": "one",
    });
    requireCount(
      parsed.positionals,
      0,
      1,
      "skills install [schema] [--profile <agent-id> ...] [--skill-host <host> ...] [--bundle default|recommended|all] [--apply-token <token>]",
    );
    const selectedProfiles = many(parsed, "--profile");
    const selectedHosts = many(parsed, "--skill-host");
    if (selectedProfiles.length === 0 && selectedHosts.length === 0)
      throw new OpsxError(
        "USAGE",
        "skills install requires a --profile or --skill-host; see skills inspect.",
      );
    if (
      new Set(selectedHosts).size !== selectedHosts.length ||
      selectedHosts.some((host) => !isSkillInstallHostId(host))
    )
      throw new OpsxError(
        "USAGE",
        "--skill-host must select each supported host at most once: opencode, omp, pi, atomic, senpi.",
      );
    const name = parsed.positionals[0] ?? (await defaultSchema(root));
    const manifest = await resources(new OpenSpecClient(root), name);
    const request: SkillInstallRequest = {
      projectRoot: root,
      schemaRoot: manifest.schema.path,
      schemaName: manifest.schema.name,
      profiles: selectedProfiles,
      skillHosts: selectedHosts as SkillInstallHostId[],
      skillBundle: skillBundle(one(parsed, "--bundle")),
    };
    const plan = await previewSkillInstall(request);
    const binding = { plan };
    const token = applyToken("skills.install", binding);
    const supplied = one(parsed, "--apply-token");
    if (supplied !== undefined) {
      if (supplied !== token)
        throw new OpsxError(
          "APPLY_TOKEN_STALE",
          "The skill installation token is stale or belongs to another request; preview again.",
        );
      return {
        phase: "applied",
        target: {
          root,
          schema: name,
          profiles: selectedProfiles,
          skillHosts: selectedHosts,
        },
        result: await withProjectMutationLock(root, () =>
          applySkillInstall(plan),
        ),
      };
    }
    return {
      phase: "preview",
      target: {
        root,
        schema: name,
        profiles: selectedProfiles,
        skillHosts: selectedHosts,
      },
      plan,
      confirmation: {
        exactTarget: `${root} skills for profiles ${selectedProfiles.join(", ") || "none"}; hosts ${selectedHosts.join(", ") || "none"}`,
        token,
      },
    };
  }
  if (operation === "replace") {
    if (rest[0] === "inspect") {
      requireCount(rest.slice(1), 1, 1, "skills replace inspect <backup-id>");
      return inspectSkillReplacement(root, rest[1]!);
    }
    const parsed = flags(rest, {
      "--schema": "one",
      "--bundle": "one",
      "--backup-id": "one",
      "--apply-token": "one",
    });
    requireCount(
      parsed.positionals,
      1,
      1,
      "skills replace <project-relative-target> --schema <installed-name> --bundle <declared-tier> --backup-id <unique-id> [--apply-token <token>]",
    );
    const schema = one(parsed, "--schema");
    const bundle = one(parsed, "--bundle");
    const backupId = one(parsed, "--backup-id");
    if (!schema || !bundle || !backupId)
      throw new OpsxError(
        "USAGE",
        "Replacement requires --schema, --bundle, and --backup-id.",
      );
    const manifest = await resources(new OpenSpecClient(root), schema);
    const plan = await previewSkillReplacement(
      {
        projectRoot: root,
        schema: manifest.schema.name,
        schemaRoot: manifest.schema.path,
        bundle: skillBundle(bundle),
        target: parsed.positionals[0]!,
        backupId,
      },
      verifiedPinOptions,
    );
    const token = applyToken("skills.replace", { plan });
    const supplied = one(parsed, "--apply-token");
    if (supplied !== undefined) {
      if (supplied !== token)
        throw new OpsxError(
          "APPLY_TOKEN_STALE",
          "The replacement token is stale or belongs to another target; preview again.",
        );
      return {
        phase: "applied",
        target: { root, path: plan.request.target, backupId },
        result: await applySkillReplacement(
          plan,
          plan.token,
          verifiedPinOptions,
        ),
      };
    }
    return {
      phase: "preview",
      target: { root, path: plan.request.target, backupId },
      plan,
      confirmation: {
        exactTarget: `${plan.request.target} from ${plan.request.schema}/${plan.request.bundle}; backup ${plan.backupPath}`,
        token,
      },
    };
  }
  if (operation === "restore") {
    const parsed = flags(rest, { "--apply-token": "one" });
    requireCount(
      parsed.positionals,
      1,
      1,
      "skills restore <backup-id> [--apply-token <token>]",
    );
    const backupId = parsed.positionals[0]!;
    const plan = await previewSkillRestore(root, backupId, verifiedPinOptions);
    const token = applyToken("skills.restore", { plan });
    const supplied = one(parsed, "--apply-token");
    if (supplied !== undefined) {
      if (supplied !== token)
        throw new OpsxError(
          "APPLY_TOKEN_STALE",
          "The restore token is stale or belongs to another backup; preview again.",
        );
      return {
        phase: "applied",
        target: { root, path: plan.projectRoot, backupId },
        result: await applySkillRestore(plan, plan.token, verifiedPinOptions),
      };
    }
    return {
      phase: "preview",
      target: { root, path: plan.projectRoot, backupId },
      plan,
      confirmation: { exactTarget: `Restore ${backupId} in ${root}`, token },
    };
  }
  if (operation === "disable") {
    const parsed = flags(rest, { "--apply-token": "one" });
    requireCount(
      parsed.positionals,
      1,
      1,
      "skills disable <project-relative-target> [--apply-token <token>]",
    );
    const required = await requiredSkillTargets(root, verifiedPinOptions);
    if (!required.complete)
      throw new OpsxError(
        "SKILL_REQUIREMENTS_INCOMPLETE",
        required.diagnostics.map((item) => item.message).join("; ") ||
          "Cannot prove no active schema requires this skill.",
      );
    const request: SkillDisableRequest = {
      projectRoot: root,
      target: parsed.positionals[0]!,
      requiredTargets: required.targets,
    };
    const plan = await previewSkillDisable(request, verifiedPinOptions);
    if (!plan.pinGuardComplete)
      throw new OpsxError(
        "SKILL_REQUIREMENTS_INCOMPLETE",
        "The skill pin guard changed or is incomplete; rerun skills doctor before disabling this target.",
      );
    const binding = { plan };
    const token = applyToken("skills.disable", binding);
    const supplied = one(parsed, "--apply-token");
    if (supplied !== undefined) {
      if (supplied !== token)
        throw new OpsxError(
          "APPLY_TOKEN_STALE",
          "The skill disable token is stale or belongs to another target; preview again.",
        );
      return {
        phase: "applied",
        target: { root, path: plan.absoluteTarget },
        result: await withProjectMutationLock(root, () =>
          applySkillDisable(plan, verifiedPinOptions),
        ),
      };
    }
    return {
      phase: "preview",
      target: { root, path: plan.absoluteTarget },
      plan,
      confirmation: { exactTarget: plan.absoluteTarget, token },
    };
  }
  throw new OpsxError(
    "USAGE",
    `Unknown skills operation ${operation}. Run opsx-schema --help for commands.`,
  );
}
