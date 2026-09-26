import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import { previewSchemaHandoff } from "../../src/cli/index.ts";
import { loadAgentProfileDigest, loadSkillBundles } from "../../src/resources/index.ts";
import { readProvenance, recordCreation, recordMigration, recordSelectionAssociation, revisionRef } from "../../src/provenance/index.ts";
import type { ChangeSelectionAssociation } from "../../src/provenance/index.ts";
import { resolveRevision, retainRevision } from "../../src/revisions/index.ts";
import { apply, inspectRecovery, preview } from "../../src/switch/index.ts";
import type { SkillInstallHostId } from "../../src/resources/index.ts";

const fixtures: string[] = [];
const request = { schema: "minimalist", profiles: [] as string[], migrations: [] as string[] };
const profileRequest = { ...request, profiles: ["alpha", "beta"] };
const sourceRoots = (source: string) => ({ "intent-driven-dev/skills": source });
const hostRequest = (skillHosts: SkillInstallHostId[]) => ({ ...request, skillHosts });

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: { changes?: string[]; compatible?: string[]; profiles?: boolean } = {}): Promise<{ root: string; sources: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "opsx-switch-test-"));
  fixtures.push(root);
  await mkdir(path.join(root, "openspec", "changes"), { recursive: true });
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: spec-driven\n");
  const client = new OpenSpecClient(root);
  const defaultRevision = await resolveRevision(client, "spec-driven");
  await cp(defaultRevision.source, path.join(root, "openspec", "schemas", "legacy-schema"), { recursive: true });
  const sources = path.join(root, "sources");
  const skill = path.join(sources, ".agents", "skills", "openspec-git-discipline");
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, "SKILL.md"), "---\nname: openspec-git-discipline\ndescription: Fixture skill\n---\n\nFixture.\n");
  if (options.profiles) {
    await writeFile(path.join(root, "profiles.json"), JSON.stringify({ schemaVersion: 1, agents: {
      alpha: { label: "Alpha", target: ".agents/skills" },
      beta: { label: "Beta", target: ".agents/skills" },
    } }));
  }
  for (const name of options.changes ?? []) {
    const directory = path.join(root, "openspec", "changes", name);
    await mkdir(directory, { recursive: true });
    if ((options.compatible ?? []).includes(name)) {
      await mkdir(path.join(directory, "specs", "switching"), { recursive: true });
      await writeFile(path.join(directory, "specs", "switching", "spec.md"), "## ADDED Requirements\n\n### Requirement: Schema switch is guarded\nThe schema switch MUST preserve project data.\n\n#### Scenario: Compatible migration\n- **GIVEN** the project is valid\n- **WHEN** the schema is migrated\n- **THEN** the pin changes only after validation\n");
      await writeFile(path.join(directory, "tasks.md"), "## 1. Implement\n\n- [ ] 1.1 Verify the switch.\n");
      const revision = await resolveRevision(client, "legacy-schema");
      await retainRevision(root, revision);
      await recordCreation(root, name, revision);
      await writeFile(path.join(directory, ".openspec.yaml"), "schema: legacy-schema\n");
    }
  }
  return { root, sources };
}

async function config(root: string): Promise<string> {
  return readFile(path.join(root, "openspec", "config.yaml"), "utf8");
}

async function plan(root: string, profiles = false, migrations: string[] = []) {
  const options = profiles ? { profileManifestPath: path.join(root, "profiles.json"), sourceRoots: sourceRoots(path.join(root, "sources")) } : {};
  return preview(root, { ...request, profiles: profiles ? profileRequest.profiles : [], migrations }, options);
}

async function selectionFor(root: string, schema: string, skillHosts: SkillInstallHostId[] = []): Promise<ChangeSelectionAssociation> {
  const revision = await resolveRevision(new OpenSpecClient(root), schema);
  const bundles = await loadSkillBundles(revision.source);
  return {
    version: 1,
    effectiveRevision: revisionRef(revision),
    profiles: [],
    skillHosts,
    skillBundle: "default",
    manifestDigests: {
      agentProfiles: await loadAgentProfileDigest(),
      schemaSkills: bundles.manifestDigests.skills,
      skillBundles: bundles.manifestDigests.profiles,
    },
  };
}

test("switch preview and Apply report shared profile targets and install the schema first", async () => {
  const { root, sources } = await fixture({ profiles: true });
  const options = { profileManifestPath: path.join(root, "profiles.json"), sourceRoots: sourceRoots(sources) };
  const reviewed = await preview(root, profileRequest, options);
  expect(reviewed.canApply).toBe(true);
  expect(reviewed.profiles.sharedTargets).toEqual([{ target: ".agents/skills/openspec-git-discipline", profiles: ["alpha", "beta"] }]);
  const result = await apply(root, profileRequest, reviewed.token, options);
  expect(result.status).toBe("applied");
  expect(await config(root)).toContain("schema: minimalist");
  expect(await readFile(path.join(root, ".agents/skills/openspec-git-discipline/SKILL.md"), "utf8")).toContain("Fixture skill");
  expect(result.journal?.actions.find((action) => action.kind === "config.activate")?.status).toBe("complete");
  expect(result.journal?.actions.find((action) => action.kind === "skills.install")?.status).toBe("complete");
});

test("schema collision blocks Apply before writing the config or journal", async () => {
  const { root } = await fixture();
  const destination = path.join(root, "openspec", "schemas", "minimalist");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, "user-owned collision\n");
  const reviewed = await preview(root, request);
  expect(reviewed.canApply).toBe(false);
  expect(reviewed.diagnostics.some((item) => item.code === "SCHEMA_COLLISION")).toBe(true);
  await expect(apply(root, request, reviewed.token)).rejects.toMatchObject({ code: "SWITCH_BLOCKED" });
  expect(await readFile(destination, "utf8")).toBe("user-owned collision\n");
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect((await inspectRecovery(root)).status).toBe("none");
});

test("unselected pinned changes and archived work remain byte-for-byte unchanged", async () => {
  const { root, sources } = await fixture({ changes: ["migrate", "pinned"], compatible: ["migrate", "pinned"] });
  const pinPath = path.join(root, "openspec", "changes", "pinned", ".openspec.yaml");
  const provenancePath = path.join(root, "openspec", "changes", "pinned", ".opsx-provenance.json");
  const pinBefore = await readFile(pinPath);
  const provenanceBefore = await readFile(provenancePath);
  const archived = path.join(root, "openspec", "changes", "archive", "2026-09-23-old-work");
  await mkdir(archived, { recursive: true });
  await writeFile(path.join(archived, "proposal.md"), "archived work remains unchanged\n");
  const archiveBefore = await readFile(path.join(archived, "proposal.md"));
  const selected = { ...request, skillHosts: ["atomic"] as SkillInstallHostId[], migrations: ["migrate"] };
  const options = { sourceRoots: sourceRoots(sources) };
  const reviewed = await preview(root, selected, options);
  expect(reviewed.canApply, JSON.stringify({ diagnostics: reviewed.diagnostics, migrations: reviewed.migrations })).toBe(true);
  const result = await apply(root, selected, reviewed.token, options);
  expect(result.status).toBe("applied");
  expect(await readFile(pinPath)).toEqual(pinBefore);
  expect(await readFile(provenancePath)).toEqual(provenanceBefore);
  expect(await readFile(path.join(archived, "proposal.md"))).toEqual(archiveBefore);
  const selection = JSON.parse(await readFile(path.join(root, "openspec", ".opsx", "selection-receipt.json"), "utf8"));
  expect(selection).toMatchObject({ effectiveRevision: { name: "minimalist", bundleSource: { name: "minimalist" } }, profiles: [], skillHosts: ["atomic"], skillBundle: "default" });
}, 30_000);

test("incompatible checked migration is rejected without project writes", async () => {
  const { root } = await fixture({ changes: ["incompatible"] });
  const reviewed = await plan(root, false, ["incompatible"]);
  expect(reviewed.canApply).toBe(false);
  expect(reviewed.diagnostics.some((item) => item.code === "MIGRATION_INCOMPATIBLE")).toBe(true);
  await expect(apply(root, { ...request, migrations: ["incompatible"] }, reviewed.token)).rejects.toMatchObject({ code: "SWITCH_BLOCKED" });
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect(await readFile(path.join(root, "openspec", "changes", "incompatible", ".openspec.yaml")).catch(() => null)).toBeNull();
  expect((await inspectRecovery(root)).status).toBe("none");
}, 30_000);

test("Apply rejects a preview after an external config edit", async () => {
  const { root } = await fixture();
  const reviewed = await preview(root, request);
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: spec-driven\n# external edit\n");
  await expect(apply(root, request, reviewed.token)).rejects.toMatchObject({ code: "SWITCH_STALE" });
  expect(await config(root)).toContain("# external edit");
  expect(await readFile(path.join(root, "openspec", "schemas", "minimalist", "schema.yaml")).catch(() => null)).toBeNull();
});

test("each journaled write boundary leaves the old default or an explicit partial recovery journal", async () => {
  const boundaries = ["schema.install", "schema.validate", "skills.install", "revision.retain", "legacy.provenance", "legacy.pin", "migration.pin", "migration.provenance", "config.activate", "postflight"] as const;
  for (const boundary of boundaries) {
    const { root, sources } = await fixture({ changes: ["migrate", "keep"], compatible: ["migrate"], profiles: true });
    const seenBoundaries: string[] = [];
    const options = { profileManifestPath: path.join(root, "profiles.json"), sourceRoots: sourceRoots(sources), afterBoundary: async (seen: string) => {
      seenBoundaries.push(seen);
      if (seen === boundary) throw new Error("injected " + boundary);
    } };
    const switchRequest = { ...profileRequest, migrations: ["migrate"] };
    const reviewed = await preview(root, switchRequest, options);
    expect(reviewed.canApply, JSON.stringify({ diagnostics: reviewed.diagnostics, migrations: reviewed.migrations })).toBe(true);
    expect(reviewed.migrations[0]?.noOp, JSON.stringify(reviewed.migrations)).toBe(false);
    const result = await apply(root, switchRequest, reviewed.token, options);
    expect(result.status, boundary + ": " + seenBoundaries.join(",")).toBe("partial");
    expect(result.journal?.state).toBe("partial");
    expect(result.journal?.actions.some((action) => action.kind === boundary && action.status === "failed"), boundary + ": " + JSON.stringify({ actions: result.journal?.actions.map(({ kind, status }) => ({ kind, status })), error: result.journal?.error, seenBoundaries })).toBe(true);
    expect(result.recovery.status).toBe("partial");
    const observedConfig = await config(root);
    if (boundary === "config.activate" || boundary === "postflight") expect(observedConfig).toContain("schema: minimalist");
    else expect(observedConfig).toContain("schema: spec-driven");
    expect(result.recovery.nextActions.length).toBeGreaterThan(0);
  }
}, 180_000);

test("a repeated switch to the already-active schema is a no-op", async () => {
  const { root, sources } = await fixture();
  const selected = hostRequest(["omp"]);
  const options = { sourceRoots: sourceRoots(sources) };
  const first = await preview(root, selected, options);
  const applied = await apply(root, selected, first.token, options);
  expect(applied.status).toBe("applied");
  const persistedReceiptPath = path.join(root, "openspec", ".opsx", "selection-receipt.json");
  expect(JSON.parse(await readFile(persistedReceiptPath, "utf8"))).toEqual(first.selectionReceipt.receipt);
  const repeated = await preview(root, selected, options);
  expect(repeated.noOp, JSON.stringify({ selectionReceipt: repeated.selectionReceipt, schema: repeated.schema, profiles: repeated.profiles, skillHosts: repeated.skillHosts })).toBe(true);
  expect(repeated.selectionReceipt.action).toBe("unchanged");
  const result = await apply(root, selected, repeated.token, options);
  expect(result.status).toBe("unchanged");
  expect(result.journal?.state).toBe("complete");
});

test("switch host selection is canonical and rejects unknown or duplicate ids", async () => {
  const { root, sources } = await fixture();
  const options = { sourceRoots: sourceRoots(sources) };
  await expect(preview(root, { ...request, skillHosts: ["bad-host"] as unknown as SkillInstallHostId[] })).rejects.toMatchObject({ code: "SWITCH_REQUEST" });
  await expect(preview(root, hostRequest(["omp", "omp"]))).rejects.toMatchObject({ code: "SWITCH_REQUEST" });

  const reviewed = await preview(root, hostRequest(["omp", "atomic"]), options);
  expect(reviewed.request.skillHosts).toEqual(["atomic", "omp"]);
  expect(reviewed.skillHosts.map(host => host.host).sort()).toEqual(["atomic", "omp", "opencode", "pi", "senpi"]);
  expect(reviewed.skillHosts.filter(host => ["atomic", "omp"].includes(host.host)).every(host => host.targets.length === 1 && host.targets[0]?.action === "install")).toBe(true);
  expect(reviewed.skillHosts.filter(host => !["atomic", "omp"].includes(host.host)).every(host => host.targets.length === 0)).toBe(true);
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect((await inspectRecovery(root)).status).toBe("none");
});

test("host preview exposes only selected targets and Apply installs the exact reviewed OMP path", async () => {
  const { root, sources } = await fixture();
  const options = { sourceRoots: sourceRoots(sources) };
  const selected = hostRequest(["omp"]);
  const targetPath = path.join(root, ".omp", "skills", "openspec-git-discipline");
  const reviewed = await preview(root, selected, options);
  const omp = reviewed.skillHosts.find(host => host.host === "omp")!;
  const atomic = reviewed.skillHosts.find(host => host.host === "atomic")!;
  expect(omp.destination).toBe(path.join(root, ".omp", "skills"));
  expect(omp.targets.map(target => ({ path: target.absoluteTarget, action: target.action }))).toEqual([{ path: targetPath, action: "install" }]);
  expect(atomic.targets).toEqual([]);
  expect(await readFile(targetPath, "utf8").catch(() => null)).toBeNull();
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect((await inspectRecovery(root)).status).toBe("none");

  const applied = await apply(root, selected, reviewed.token, options);
  expect(applied.status).toBe("applied");
  expect(await readFile(path.join(targetPath, "SKILL.md"), "utf8")).toContain("Fixture skill");
  const skillsAction = applied.journal?.actions.find(action => action.kind === "skills.install");
  expect(skillsAction?.status).toBe("complete");
  expect(skillsAction?.targets).toContain(targetPath);
  expect(skillsAction?.targets.some(target => target.includes(path.join(".atomic", "skills")))).toBe(false);
  expect(applied.recovery.writes.find(write => write.target === targetPath)?.state).toBe("complete");

  const targetBefore = await readFile(path.join(targetPath, "SKILL.md"));
  const ownershipPath = path.join(root, ".openspec", "opsx-schema", "managed-resources.json");
  const ownershipBefore = await readFile(ownershipPath);
  const configBefore = await config(root);
  const noOpPreview = await preview(root, selected, options);
  expect(noOpPreview.noOp, JSON.stringify({ selectionReceipt: noOpPreview.selectionReceipt, schema: noOpPreview.schema, profiles: noOpPreview.profiles, skillHosts: noOpPreview.skillHosts })).toBe(true);
  const noOp = await apply(root, selected, noOpPreview.token, options);
  expect(noOp.status).toBe("unchanged");
  expect(noOp.journal?.id).toBe(applied.journal?.id);
  expect(await readFile(path.join(targetPath, "SKILL.md"))).toEqual(targetBefore);
  expect(await readFile(ownershipPath)).toEqual(ownershipBefore);
  expect(await config(root)).toBe(configBefore);
});

test("records explicit host selection for a schema with no declared skills", async () => {
  const { root, sources } = await fixture();
  const schemaRoot = path.join(root, "openspec", "schemas", "empty-skills");
  await cp(path.join(root, "openspec", "schemas", "legacy-schema"), schemaRoot, { recursive: true });
  await writeFile(path.join(schemaRoot, "skills.txt"), "\n");
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: empty-skills\n");
  const selected = { ...request, schema: "empty-skills", skillHosts: ["atomic"] as SkillInstallHostId[] };
  const options = { sourceRoots: sourceRoots(sources) };
  const reviewed = await preview(root, selected, options);
  expect(reviewed.canApply).toBe(true);
  expect(reviewed.noOp).toBe(false);
  expect(reviewed.skillHosts.find(host => host.host === "atomic")?.targets).toEqual([]);
  expect(reviewed.selectionReceipt).toMatchObject({
    action: "write",
    receipt: {
      version: 1,
      effectiveRevision: { name: "empty-skills" },
      profiles: [],
      skillHosts: ["atomic"],
      skillBundle: "default",
    },
  });
  expect(reviewed.selectionReceipt.receipt?.manifestDigests.schemaSkills).toMatch(/^[0-9a-f]{64}$/);
  const result = await apply(root, selected, reviewed.token, options);
  expect(result.status).toBe("applied");
  expect(result.journal?.actions.find(action => action.kind === "selection.receipt")?.status).toBe("complete");
  const receiptPath = path.join(root, "openspec", ".opsx", "selection-receipt.json");
  expect(JSON.parse(await readFile(receiptPath, "utf8"))).toEqual(reviewed.selectionReceipt.receipt);
  const association = reviewed.selectionReceipt.receipt!;
  const inheritedChange = path.join(root, "openspec", "changes", "created-after-switch");
  await mkdir(inheritedChange, { recursive: true });
  await writeFile(path.join(inheritedChange, ".openspec.yaml"), "schema: empty-skills\n");
  await recordCreation(root, "created-after-switch", association.effectiveRevision, association);
  expect((await readProvenance(inheritedChange))?.association).toEqual(association);
  const unassociatedChange = path.join(root, "openspec", "changes", "without-association");
  await mkdir(unassociatedChange, { recursive: true });
  await writeFile(path.join(unassociatedChange, ".openspec.yaml"), "schema: empty-skills\n");
  await recordCreation(root, "without-association", association.effectiveRevision);
  expect((await readProvenance(unassociatedChange))?.association).toBeUndefined();
  expect(await readFile(path.join(root, "openspec", "config.yaml"), "utf8")).toBe("schema: empty-skills\n");
  expect(await readFile(path.join(root, ".atomic", "skills", "openspec-git-discipline", "SKILL.md"), "utf8").catch(() => null)).toBeNull();
  expect((await inspectRecovery(root)).status).toBe("complete");
  const repeated = await preview(root, selected, options);
  expect(repeated.noOp).toBe(true);
  const repeatedApply = await apply(root, selected, repeated.token, options);
  expect(repeatedApply.status).toBe("unchanged");
  expect(repeatedApply.journal?.id).toBe(result.journal?.id);
}, 30_000);

test("reconciles missing selection associations without inventing creation history", async () => {
  const { root, sources } = await fixture();
  const schemaRoot = path.join(root, "openspec", "schemas", "empty-skills");
  await cp(path.join(root, "openspec", "schemas", "legacy-schema"), schemaRoot, { recursive: true });
  await writeFile(path.join(schemaRoot, "skills.txt"), "\n");
  const client = new OpenSpecClient(root);
  const revision = await resolveRevision(client, "empty-skills");
  const selected = { ...request, schema: "empty-skills", skillHosts: ["atomic"] as SkillInstallHostId[] };
  const reviewed = await preview(root, selected, { sourceRoots: sourceRoots(sources) });
  expect(reviewed.canApply).toBe(true);
  const association = reviewed.selectionReceipt.receipt!;

  const legacy = path.join(root, "openspec", "changes", "legacy-pin");
  await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, ".openspec.yaml"), "schema: empty-skills\n");
  await recordSelectionAssociation(root, "legacy-pin", association.effectiveRevision, association);
  const reconciled = await readProvenance(legacy);
  expect(reconciled).toMatchObject({ version: 1, created: null, retained: association.effectiveRevision, migrations: [], association });
  const reconciledBytes = await readFile(path.join(legacy, ".opsx-provenance.json"));
  await recordSelectionAssociation(root, "legacy-pin", association.effectiveRevision, association);
  expect(await readFile(path.join(legacy, ".opsx-provenance.json"))).toEqual(reconciledBytes);
  await expect(recordSelectionAssociation(root, "legacy-pin", association.effectiveRevision, { ...association, profiles: ["alpha"] }))
    .rejects.toMatchObject({ code: "PROVENANCE_ASSOCIATION_MISMATCH" });
  expect(await readFile(path.join(legacy, ".opsx-provenance.json"))).toEqual(reconciledBytes);

  const wrongPin = path.join(root, "openspec", "changes", "wrong-pin");
  await mkdir(wrongPin, { recursive: true });
  await writeFile(path.join(wrongPin, ".openspec.yaml"), "schema: spec-driven\n");
  await expect(recordSelectionAssociation(root, "wrong-pin", association.effectiveRevision, association))
    .rejects.toMatchObject({ code: "PROVENANCE_PIN_MISMATCH" });
  expect(await readFile(path.join(wrongPin, ".opsx-provenance.json")).catch(() => null)).toBeNull();

  const migrated = path.join(root, "openspec", "changes", "existing-history");
  await mkdir(migrated, { recursive: true });
  await writeFile(path.join(migrated, ".openspec.yaml"), "schema: empty-skills\n");
  const original = await resolveRevision(client, "spec-driven");
  await recordCreation(root, "existing-history", original);
  await recordMigration(root, "existing-history", original, revision);
  const prior = await readProvenance(migrated);
  await recordSelectionAssociation(root, "existing-history", association.effectiveRevision, association);
  const associatedHistory = await readProvenance(migrated);
  expect(associatedHistory?.created).toEqual(prior?.created);
  expect(associatedHistory?.migrations).toEqual(prior?.migrations);
  expect(associatedHistory?.association).toEqual(association);
}, 30_000);

test("Apply rejects changed host selections and changed host target state without switch writes", async () => {
  const { root, sources } = await fixture();
  const options = { sourceRoots: sourceRoots(sources) };
  const reviewed = await preview(root, hostRequest(["omp"]), options);
  await expect(apply(root, hostRequest(["atomic"]), reviewed.token, options)).rejects.toMatchObject({ code: "SWITCH_STALE" });
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect(await readFile(path.join(root, ".omp", "skills", "openspec-git-discipline", "SKILL.md")).catch(() => null)).toBeNull();
  expect((await inspectRecovery(root)).status).toBe("none");

  const targetPath = path.join(root, ".omp", "skills", "openspec-git-discipline");
  await mkdir(targetPath, { recursive: true });
  await writeFile(path.join(targetPath, "user.txt"), "external\n");
  await expect(apply(root, hostRequest(["omp"]), reviewed.token, options)).rejects.toMatchObject({ code: "SWITCH_STALE" });
  expect(await readFile(path.join(targetPath, "user.txt"), "utf8")).toBe("external\n");
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect((await inspectRecovery(root)).status).toBe("none");
});

test("unsafe selected host collisions block Apply without touching user data", async () => {
  const { root, sources } = await fixture();
  const options = { sourceRoots: sourceRoots(sources) };
  await writeFile(path.join(root, ".atomic"), "user-owned host obstruction\n");
  const selected = hostRequest(["atomic"]);
  const reviewed = await preview(root, selected, options);
  const atomic = reviewed.skillHosts.find(host => host.host === "atomic")!;
  expect(atomic.action).toBe("refuse");
  expect(atomic.reason).toBeTruthy();
  expect(reviewed.canApply).toBe(false);
  await expect(apply(root, selected, reviewed.token, options)).rejects.toMatchObject({ code: "SWITCH_BLOCKED" });
  expect(await readFile(path.join(root, ".atomic"), "utf8")).toBe("user-owned host obstruction\n");
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect((await inspectRecovery(root)).status).toBe("none");
});

test("interrupted host install is journaled as partial and recovery identifies installed host targets", async () => {
  const { root, sources } = await fixture();
  const options = {
    sourceRoots: sourceRoots(sources),
    afterBoundary: async (boundary: string) => { if (boundary === "skills.install") throw new Error("injected skills.install interruption"); },
  };
  const selected = hostRequest(["atomic"]);
  const reviewed = await preview(root, selected, options);
  const targetPath = path.join(root, ".atomic", "skills", "openspec-git-discipline");
  const result = await apply(root, selected, reviewed.token, options);
  expect(result.status).toBe("partial");
  expect(result.journal?.state).toBe("partial");
  expect(result.journal?.actions.find(action => action.kind === "skills.install")?.status).toBe("failed");
  expect(result.recovery.status).toBe("partial");
  expect(result.recovery.writes.find(write => write.target === targetPath)?.state).toBe("complete");
  expect(await config(root)).toBe("schema: spec-driven\n");
  expect(await readFile(path.join(targetPath, "SKILL.md"), "utf8")).toContain("Fixture skill");
});

test("schema migration rebinds an associated change to the reviewed target selection and skills doctor accepts it", async () => {
  const { root, sources } = await fixture({ changes: ["migrate"], compatible: ["migrate"] });
  const original = await selectionFor(root, "legacy-schema", ["atomic"]);
  await recordSelectionAssociation(root, "migrate", original.effectiveRevision, original);
  const selected = { ...request, skillHosts: ["atomic"] as SkillInstallHostId[], migrations: ["migrate"] };
  const options = { sourceRoots: sourceRoots(sources) };
  const reviewed = await preview(root, selected, options);
  expect(reviewed.canApply, JSON.stringify(reviewed.diagnostics)).toBe(true);
  expect(reviewed.selectionReceipt.receipt).not.toBeNull();

  const applied = await apply(root, selected, reviewed.token, options);
  expect(applied.status).toBe("applied");
  const provenance = await readProvenance(path.join(root, "openspec", "changes", "migrate"));
  expect(provenance?.association).toEqual(reviewed.selectionReceipt.receipt!);
  expect(provenance?.migrations.at(-1)?.to).toEqual(reviewed.selectionReceipt.receipt?.effectiveRevision);
  expect(applied.journal?.actions.find(action => action.kind === "migration.provenance")?.status).toBe("complete");

  const cli = path.resolve(import.meta.dir, "../../src/domain/cli.ts");
  const doctor = spawnSync(process.execPath, [cli, "--project", root, "skills", "doctor", "--json"], { encoding: "utf8" });
  expect(doctor.error).toBeUndefined();
  expect(doctor.status, doctor.stderr + doctor.stdout).toBe(0);
  const result = JSON.parse(doctor.stdout);
  expect(result.ok, doctor.stdout).toBe(true);
  expect(result.data.complete, doctor.stdout).toBe(true);
  expect(result.data.required.activePins).toContainEqual({
    change: "migrate",
    schema: reviewed.selectionReceipt.receipt!.effectiveRevision.name,
    revisionDigest: reviewed.selectionReceipt.receipt!.effectiveRevision.digest,
  });
}, 30_000);

test("associated migration without a verified target selection is refused before project writes", async () => {
  const { root } = await fixture({ changes: ["migrate"], compatible: ["migrate"] });
  const original = await selectionFor(root, "legacy-schema", ["atomic"]);
  await recordSelectionAssociation(root, "migrate", original.effectiveRevision, original);
  const targetSchema = path.join(root, "openspec", "schemas", "requires-selection");
  await cp(path.join(root, "openspec", "schemas", "legacy-schema"), targetSchema, { recursive: true });
  await writeFile(path.join(targetSchema, "skills.txt"), "openspec-git-discipline\n");
  const changeDirectory = path.join(root, "openspec", "changes", "migrate");
  await writeFile(path.join(changeDirectory, "proposal.md"), "# Migration\n");
  await writeFile(path.join(changeDirectory, "design.md"), "# Pin transition\n");
  const selected = { schema: "requires-selection", profiles: [], migrations: ["migrate"] };
  const pinPath = path.join(root, "openspec", "changes", "migrate", ".openspec.yaml");
  const provenancePath = path.join(root, "openspec", "changes", "migrate", ".opsx-provenance.json");
  const pinBefore = await readFile(pinPath);
  const provenanceBefore = await readFile(provenancePath);
  const configBefore = await config(root);

  const reviewed = await preview(root, selected);
  expect(reviewed.canApply).toBe(false);
  expect(reviewed.diagnostics.some(item => item.code === "MIGRATION_SELECTION_UNVERIFIED"), JSON.stringify(reviewed.diagnostics)).toBe(true);
  expect(reviewed.diagnostics.some(item => item.code === "RESOURCE_SELECTION_REQUIRED"), JSON.stringify(reviewed.diagnostics)).toBe(true);
  await expect(apply(root, selected, reviewed.token)).rejects.toMatchObject({ code: "SWITCH_BLOCKED" });
  expect(await readFile(pinPath)).toEqual(pinBefore);
  expect(await readFile(provenancePath)).toEqual(provenanceBefore);
  expect(await config(root)).toBe(configBefore);
  expect((await inspectRecovery(root)).status).toBe("none");
  expect(await readFile(path.join(root, "openspec", ".opsx", "selection-receipt.json")).catch(() => null)).toBeNull();
}, 30_000);

test("standalone handoff refuses an associated change before staging or metadata writes", async () => {
  const { root } = await fixture({ changes: ["migrate"], compatible: ["migrate"] });
  const original = await selectionFor(root, "legacy-schema", ["atomic"]);
  await recordSelectionAssociation(root, "migrate", original.effectiveRevision, original);
  const targetSchema = path.join(root, "openspec", "schemas", "handoff-target");
  await cp(path.join(root, "openspec", "schemas", "legacy-schema"), targetSchema, { recursive: true });
  const pinPath = path.join(root, "openspec", "changes", "migrate", ".openspec.yaml");
  const provenancePath = path.join(root, "openspec", "changes", "migrate", ".opsx-provenance.json");
  const pinBefore = await readFile(pinPath);
  const provenanceBefore = await readFile(provenancePath);

  const result = await previewSchemaHandoff(root, "migrate", "handoff-target");
  expect(result).toMatchObject({ ok: false, error: { code: "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED" } });
  expect(await readFile(pinPath)).toEqual(pinBefore);
  expect(await readFile(provenancePath)).toEqual(provenanceBefore);
  expect((await inspectRecovery(root)).status).toBe("none");
}, 30_000);
