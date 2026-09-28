import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applySkillDisable,
  applySkillInstall,
  doctorSkills,
  discoverSkillInstallHosts,
  isSkillInstallHostId,
  loadAgentProfileDigest,
  loadAgentProfiles,
  loadSkillBundles,
  parseSkillsManifest,
  requiredSkillTargets,
  previewSkillDisable,
  previewSkillInstall,
  SKILL_INSTALL_HOST_IDS,
  type SkillInstallHostId,
  type ResourceRuntimeOptions,
} from "../../src/resources/index.ts";

const created: string[] = [];
const repository = "intent-driven-dev/skills";
const profiles = {
  schemaVersion: 1,
  agents: {
    codex: { label: "Codex", target: ".agents/skills" },
    opencode: { label: "OpenCode", target: ".agents/skills" },
    claude: { label: "Claude Code", target: ".claude/skills" },
  },
};

async function fixture(skillManifest: string) {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-resources-"));
  created.push(root);
  const projectRoot = path.join(root, "project");
  const schemaRoot = path.join(root, "schema");
  const profileManifestPath = path.join(root, "opsx-schema.json");
  const sourceRoot = path.join(root, "source");
  await Promise.all([mkdir(projectRoot), mkdir(schemaRoot), mkdir(sourceRoot)]);
  await writeFile(
    path.join(profileManifestPath),
    `${JSON.stringify(profiles, null, 2)}\n`,
  );
  await writeFile(path.join(schemaRoot, "skills.txt"), skillManifest);
  const options: ResourceRuntimeOptions = {
    profileManifestPath,
    sourceRoots: { [repository]: sourceRoot },
  };
  return {
    root,
    projectRoot,
    schemaRoot,
    profileManifestPath,
    sourceRoot,
    options,
  };
}

async function addSkill(
  sourceRoot: string,
  name: string,
  files: Record<string, string> = { "SKILL.md": `# ${name}\n` },
) {
  const directory = path.join(sourceRoot, ".agents", "skills", name);
  await mkdir(directory, { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(directory, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
}

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("bare and source-qualified skill declarations resolve to complete source folders", () => {
  expect(
    parseSkillsManifest(
      "# comment\nlegacy-skill\nother/skills\tpackages/skill-pack\n",
    ),
  ).toEqual([
    {
      repository: "intent-driven-dev/skills",
      path: ".agents/skills/legacy-skill",
      skill: "legacy-skill",
    },
    {
      repository: "other/skills",
      path: "packages/skill-pack",
      skill: "skill-pack",
    },
  ]);
  expect(() => parseSkillsManifest("owner/repo packages/skill")).toThrow(
    expect.objectContaining({ code: "RESOURCE_MANIFEST_INVALID" }),
  );
});

test("checked-in named agents map only to project-local skill targets", async () => {
  const checkedIn = await loadAgentProfiles();
  expect(checkedIn.map((profile) => profile.id)).toEqual([
    "claude-code",
    "codex",
    "cursor",
    "gemini-cli",
    "opencode",
  ]);
  expect(checkedIn.find((profile) => profile.id === "codex")?.target).toBe(
    ".agents/skills",
  );
  expect(checkedIn.find((profile) => profile.id === "opencode")?.target).toBe(
    ".agents/skills",
  );
  expect(
    checkedIn.every(
      (profile) =>
        !path.isAbsolute(profile.target) && !profile.target.startsWith("~"),
    ),
  ).toBe(true);
});

test("agent-profile manifest digest is available independently of skill declarations", async () => {
  const f = await fixture("");
  const manifest = await readFile(f.profileManifestPath, "utf8");
  const expectedDigest = createHash("sha256").update(manifest).digest("hex");

  expect(await loadAgentProfileDigest(f.profileManifestPath)).toBe(
    expectedDigest,
  );
});

test("source-qualified declarations install a complete folder from an injected checkout", async () => {
  const f = await fixture("");
  const qualifiedRepository = "custom/skills";
  const source = path.join(f.sourceRoot, "skillpacks", "custom-skill");
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "SKILL.md"), "qualified source\n");
  await writeFile(
    path.join(f.schemaRoot, "skills.txt"),
    qualifiedRepository + "\tskillpacks/custom-skill\n",
  );
  const options: ResourceRuntimeOptions = {
    profileManifestPath: f.profileManifestPath,
    sourceRoots: { [qualifiedRepository]: f.sourceRoot },
  };

  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["claude"],
    },
    options,
  );
  expect(plan.targets[0]).toMatchObject({
    repository: qualifiedRepository,
    sourcePath: "skillpacks/custom-skill",
    relativeTarget: ".claude/skills/custom-skill",
  });
  await applySkillInstall(plan, options);
  expect(
    await readFile(
      path.join(f.projectRoot, ".claude/skills/custom-skill/SKILL.md"),
      "utf8",
    ),
  ).toBe("qualified source\n");
});

test("skill bundles inherit source declarations and remain distinct from named agents", async () => {
  const f = await fixture("base-skill\n");
  await addSkill(f.sourceRoot, "base-skill");
  await addSkill(f.sourceRoot, "recommended-skill");
  await addSkill(f.sourceRoot, "all-skill");
  const bundleManifest = {
    schemaVersion: 1,
    profiles: {
      recommended: {
        extends: ["default"],
        resources: [
          { source: repository, path: ".agents/skills/recommended-skill" },
        ],
      },
      all: {
        extends: ["recommended"],
        resources: [{ source: repository, path: ".agents/skills/all-skill" }],
      },
    },
  };
  await writeFile(
    path.join(f.schemaRoot, "skill-profiles.yaml"),
    JSON.stringify(bundleManifest),
  );

  const catalog = await loadSkillBundles(f.schemaRoot);
  expect(catalog.bundles).toEqual(["default", "recommended", "all"]);
  expect(
    catalog.declarations.default?.map((declaration) => declaration.skill),
  ).toEqual(["base-skill"]);
  expect(
    catalog.declarations.recommended?.map((declaration) => declaration.skill),
  ).toEqual(["base-skill", "recommended-skill"]);

  const defaultPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
    },
    f.options,
  );
  expect(defaultPlan.request).toMatchObject({
    profiles: ["codex"],
    skillBundle: "default",
  });
  expect(defaultPlan.targets.map((target) => target.skill)).toEqual([
    "base-skill",
  ]);
  const recommendedPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
      skillBundle: "recommended",
    },
    f.options,
  );
  expect(recommendedPlan.targets.map((target) => target.skill)).toEqual([
    "base-skill",
    "recommended-skill",
  ]);
  const allPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
      skillBundle: "all",
    },
    f.options,
  );
  expect(allPlan.targets.map((target) => target.skill)).toEqual([
    "all-skill",
    "base-skill",
    "recommended-skill",
  ]);
  await applySkillInstall(recommendedPlan, f.options);
  expect(
    await readFile(
      path.join(f.projectRoot, ".agents/skills/recommended-skill/SKILL.md"),
      "utf8",
    ),
  ).toBe("# recommended-skill\n");
  await expect(
    readFile(
      path.join(f.projectRoot, ".agents/skills/all-skill/SKILL.md"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("an undeclared recommended bundle is not aliased to the default manifest", async () => {
  const f = await fixture("base-skill\n");
  const catalog = await loadSkillBundles(f.schemaRoot);
  expect(catalog.bundles).toEqual(["default"]);
  await expect(
    previewSkillInstall(
      {
        projectRoot: f.projectRoot,
        schemaRoot: f.schemaRoot,
        profiles: ["codex"],
        skillBundle: "recommended",
      },
      f.options,
    ),
  ).rejects.toMatchObject({ code: "PROFILE_UNDECLARED" });
});

test("bundle inheritance cycles are rejected and bundle changes stale install plans", async () => {
  const cyclic = await fixture("");
  await writeFile(
    path.join(cyclic.schemaRoot, "skill-profiles.yaml"),
    JSON.stringify({
      schemaVersion: 1,
      profiles: {
        recommended: { extends: ["all"], resources: [] },
        all: { extends: ["recommended"], resources: [] },
      },
    }),
  );
  await expect(loadSkillBundles(cyclic.schemaRoot)).rejects.toMatchObject({
    code: "RESOURCE_BUNDLE_MANIFEST_INVALID",
  });

  const f = await fixture("base-skill\n");
  await addSkill(f.sourceRoot, "base-skill");
  await addSkill(f.sourceRoot, "recommended-skill");
  const manifest = {
    schemaVersion: 1,
    profiles: {
      recommended: {
        extends: ["default"],
        resources: [
          { source: repository, path: ".agents/skills/recommended-skill" },
        ],
      },
    },
  };
  const file = path.join(f.schemaRoot, "skill-profiles.yaml");
  await writeFile(file, JSON.stringify(manifest));
  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
      skillBundle: "recommended",
    },
    f.options,
  );
  await writeFile(
    file,
    JSON.stringify({
      schemaVersion: 1,
      profiles: { recommended: { extends: ["default"], resources: [] } },
    }),
  );
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_STALE",
  });
  await expect(
    readFile(
      path.join(f.projectRoot, ".agents/skills/base-skill/SKILL.md"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("selected named agents sharing one host path produce one owned physical write", async () => {
  const f = await fixture("shared-skill\n");
  await addSkill(f.sourceRoot, "shared-skill", {
    "SKILL.md": "complete skill\n",
    "references/notes.txt": "also copied\n",
  });

  const loadedProfiles = await loadAgentProfiles(f.profileManifestPath);
  expect(loadedProfiles.map((profile) => profile.id)).toEqual([
    "claude",
    "codex",
    "opencode",
  ]);
  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex", "opencode"],
    },
    f.options,
  );

  expect(plan.canApply).toBe(true);
  expect(Object.isFrozen(plan)).toBe(true);
  expect(plan.targets).toHaveLength(1);
  expect(plan.targets[0]).toMatchObject({
    relativeTarget: ".agents/skills/shared-skill",
    profiles: ["codex", "opencode"],
    sharedProfiles: ["codex", "opencode"],
    state: "missing",
    action: "install",
  });
  const result = await applySkillInstall(plan, f.options);
  expect(result.installedTargets).toEqual([".agents/skills/shared-skill"]);
  expect(
    await readFile(
      path.join(f.projectRoot, ".agents/skills/shared-skill/SKILL.md"),
      "utf8",
    ),
  ).toBe("complete skill\n");
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ".agents/skills/shared-skill/references/notes.txt",
      ),
      "utf8",
    ),
  ).toBe("also copied\n");

  const repeated = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex", "opencode"],
    },
    f.options,
  );
  expect(repeated.targets[0]?.action).toBe("noop");
  expect(await applySkillInstall(repeated, f.options)).toMatchObject({
    applied: false,
    installedTargets: [],
    unchangedTargets: [".agents/skills/shared-skill"],
  });
});

test("unmanaged collision refuses the complete install before writing other skills", async () => {
  const f = await fixture("occupied\nfresh\n");
  await addSkill(f.sourceRoot, "occupied");
  await addSkill(f.sourceRoot, "fresh");
  const occupied = path.join(f.projectRoot, ".agents/skills/occupied");
  await mkdir(occupied, { recursive: true });
  await writeFile(path.join(occupied, "local.txt"), "keep me\n");

  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
    },
    f.options,
  );
  expect(plan.canApply).toBe(false);
  expect(plan.targets.map((target) => target.action)).toEqual([
    "install",
    "refuse",
  ]);
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(await readFile(path.join(occupied, "local.txt"), "utf8")).toBe(
    "keep me\n",
  );
  await expect(
    readFile(path.join(f.projectRoot, ".agents/skills/fresh/SKILL.md"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await expect(
    readFile(
      path.join(f.projectRoot, ".openspec/opsx-schema/managed-resources.json"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("installing a new schema skill retains older installed skills", async () => {
  const f = await fixture("old-skill\n");
  await addSkill(f.sourceRoot, "old-skill");
  await addSkill(f.sourceRoot, "new-skill");
  const oldPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
    },
    f.options,
  );
  await applySkillInstall(oldPlan, f.options);

  const nextSchema = path.join(f.root, "next-schema");
  await mkdir(nextSchema);
  await writeFile(path.join(nextSchema, "skills.txt"), "new-skill\n");
  const nextPlan = await previewSkillInstall(
    { projectRoot: f.projectRoot, schemaRoot: nextSchema, profiles: ["codex"] },
    f.options,
  );
  await applySkillInstall(nextPlan, f.options);

  expect(
    await readFile(
      path.join(f.projectRoot, ".agents/skills/old-skill/SKILL.md"),
      "utf8",
    ),
  ).toBe("# old-skill\n");
  expect(
    await readFile(
      path.join(f.projectRoot, ".agents/skills/new-skill/SKILL.md"),
      "utf8",
    ),
  ).toBe("# new-skill\n");
});

test("disable refuses an active pinned requirement and a target shared by agents", async () => {
  const f = await fixture("protected-skill\n");
  await addSkill(f.sourceRoot, "protected-skill");
  const installPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
    },
    f.options,
  );
  await applySkillInstall(installPlan, f.options);
  const target = ".agents/skills/protected-skill";
  const activeOptions: ResourceRuntimeOptions = {
    ...f.options,
    resolveActivePins: async () => [
      {
        change: "active-change",
        schema: "fixture-schema",
        schemaRoot: f.schemaRoot,
        profiles: ["codex"],
        skillHosts: [],
        skillBundle: "default",
      },
    ],
  };

  const activePlan = await previewSkillDisable(
    { projectRoot: f.projectRoot, target },
    activeOptions,
  );
  expect(activePlan.canApply).toBe(false);
  expect(activePlan.diagnostics.map((item) => item.code)).toContain(
    "RESOURCE_REQUIRED_BY_ACTIVE_PIN",
  );
  await expect(
    applySkillDisable(activePlan, activeOptions),
  ).rejects.toMatchObject({ code: "RESOURCE_BLOCKED" });
  expect(
    await readFile(path.join(f.projectRoot, target, "SKILL.md"), "utf8"),
  ).toBe("# protected-skill\n");

  const sharedPlan = await previewSkillDisable(
    { projectRoot: f.projectRoot, target, requiredTargets: [] },
    f.options,
  );
  expect(sharedPlan.canApply).toBe(false);
  expect(sharedPlan.sharedProfiles).toEqual(["codex", "opencode"]);
  expect(sharedPlan.diagnostics.map((item) => item.code)).toContain(
    "RESOURCE_SHARED_TARGET",
  );
  await expect(applySkillDisable(sharedPlan)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(
    await readFile(path.join(f.projectRoot, target, "SKILL.md"), "utf8"),
  ).toBe("# protected-skill\n");
});

test("a native host selected by an active pin protects only its installed skill target", async () => {
  const f = await fixture("protected-skill\n");
  const skill =
    "---\nname: protected-skill\ndescription: Required by an active pin.\n---\n\n# Protected skill\n";
  await addSkill(f.sourceRoot, "protected-skill", { "SKILL.md": skill });
  const options: ResourceRuntimeOptions = {
    ...f.options,
    resolveActivePins: async () => [
      {
        change: "active-change",
        schema: "fixture-schema",
        schemaRoot: f.schemaRoot,
        profiles: [],
        skillHosts: ["omp"],
        skillBundle: "default",
      },
    ],
  };
  const installed = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: [],
      skillHosts: ["omp"],
    },
    f.options,
  );
  await applySkillInstall(installed, f.options);
  const target = ".omp/skills/protected-skill";
  const guard = await requiredSkillTargets(f.projectRoot, options);
  expect(guard).toMatchObject({ complete: true, targets: [target] });
  const plan = await previewSkillDisable(
    { projectRoot: f.projectRoot, target },
    options,
  );
  expect(plan.canApply).toBe(false);
  expect(plan.diagnostics.map((item) => item.code)).toContain(
    "RESOURCE_REQUIRED_BY_ACTIVE_PIN",
  );
  await expect(applySkillDisable(plan, options)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(
    await readFile(path.join(f.projectRoot, target, "SKILL.md"), "utf8"),
  ).toBe(skill);
});

test("explicit empty selection is valid for a pinned schema without declared skills", async () => {
  const f = await fixture("");
  const guard = await requiredSkillTargets(f.projectRoot, {
    ...f.options,
    resolveActivePins: async () => [
      {
        change: "no-skill-change",
        schema: "fixture-schema",
        schemaRoot: f.schemaRoot,
        profiles: [],
        skillHosts: [],
        skillBundle: "default",
      },
    ],
  });
  expect(guard).toMatchObject({ complete: true, targets: [] });
});

test("a project with no active pins can disable an owned unshared skill", async () => {
  const f = await fixture("solo-skill");
  await addSkill(f.sourceRoot, "solo-skill");
  const installPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["claude"],
    },
    f.options,
  );
  await applySkillInstall(installPlan, f.options);

  const required = await requiredSkillTargets(f.projectRoot, f.options);
  expect(required).toMatchObject({
    complete: true,
    targets: [],
    activePins: [],
  });
  const audit = await doctorSkills(f.projectRoot, f.options);
  expect(audit.complete).toBe(true);
  expect(audit.targets).toMatchObject([
    {
      target: ".claude/skills/solo-skill",
      state: "owned",
      requiredByPinnedChange: false,
    },
  ]);

  const target = ".claude/skills/solo-skill";
  const plan = await previewSkillDisable(
    { projectRoot: f.projectRoot, target },
    f.options,
  );
  expect(plan.canApply).toBe(true);
  expect(plan.requiredByPinnedChange).toBe(false);
  expect(await applySkillDisable(plan, f.options)).toMatchObject({
    applied: true,
    removedTarget: target,
  });
  await expect(
    readFile(path.join(f.projectRoot, target, "SKILL.md"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("unassociated active schema pins keep disable fail-closed", async () => {
  const f = await fixture("solo-skill");
  await addSkill(f.sourceRoot, "solo-skill");
  const installPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["claude"],
    },
    f.options,
  );
  await applySkillInstall(installPlan, f.options);
  const change = path.join(f.projectRoot, "openspec/changes/active-change");
  await mkdir(change, { recursive: true });
  await writeFile(
    path.join(change, ".openspec.yaml"),
    "schema: fixture-schema",
  );

  const required = await requiredSkillTargets(f.projectRoot, f.options);
  expect(required.complete).toBe(false);
  expect(required.diagnostics.map((item) => item.code)).toContain(
    "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
  );
  const plan = await previewSkillDisable(
    { projectRoot: f.projectRoot, target: ".claude/skills/solo-skill" },
    f.options,
  );
  expect(plan.canApply).toBe(false);
  await expect(applySkillDisable(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(
    await readFile(
      path.join(f.projectRoot, ".claude/skills/solo-skill/SKILL.md"),
      "utf8",
    ),
  ).toContain("solo-skill");
});

test("a skill plan is stale when its exact inputs change after preview", async () => {
  const f = await fixture("fresh-skill\n");
  await addSkill(f.sourceRoot, "fresh-skill");
  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
    },
    f.options,
  );
  await writeFile(path.join(f.schemaRoot, "skills.txt"), "changed-skill\n");
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_STALE",
  });
  await expect(
    readFile(
      path.join(f.projectRoot, ".agents/skills/fresh-skill/SKILL.md"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("installation and disable refuse symlinked skill targets", async () => {
  const f = await fixture("unsafe-skill\n");
  await addSkill(f.sourceRoot, "unsafe-skill");
  const outside = path.join(f.root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "SKILL.md"), "outside content\n");
  const target = path.join(f.projectRoot, ".agents/skills/unsafe-skill");
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(outside, target, "dir");

  const installPlan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["codex"],
    },
    f.options,
  );
  expect(installPlan.canApply).toBe(false);
  expect(installPlan.targets[0]?.state).toBe("symlink");
  await expect(applySkillInstall(installPlan, f.options)).rejects.toMatchObject(
    { code: "RESOURCE_BLOCKED" },
  );
  const disablePlan = await previewSkillDisable(
    {
      projectRoot: f.projectRoot,
      target: ".agents/skills/unsafe-skill",
      requiredTargets: [],
    },
    f.options,
  );
  expect(disablePlan.canApply).toBe(false);
  await expect(applySkillDisable(disablePlan)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(await realpath(target)).toBe(outside);
  expect(await readFile(path.join(outside, "SKILL.md"), "utf8")).toBe(
    "outside content\n",
  );
});

test("five native project skill hosts stage without writing and install to their verified roots", async () => {
  const f = await fixture("host-skill\n");
  const skill = `---\nname: host-skill\ndescription: A fixture skill for native hosts.\n---\n\n# Host skill\n`;
  await addSkill(f.sourceRoot, "host-skill", {
    "SKILL.md": skill,
    "references/guide.txt": "kept with the skill\n",
  });
  const expectedHosts = [
    {
      host: "opencode",
      relativeDestination: ".opencode/skills",
      trust: "not-required",
    },
    { host: "omp", relativeDestination: ".omp/skills", trust: "not-required" },
    { host: "pi", relativeDestination: ".pi/skills", trust: "external" },
    {
      host: "atomic",
      relativeDestination: ".atomic/skills",
      trust: "external",
    },
    { host: "senpi", relativeDestination: ".senpi/skills", trust: "external" },
  ] as const;
  const hostIds: readonly SkillInstallHostId[] = SKILL_INSTALL_HOST_IDS;
  const expectedHostIds: readonly SkillInstallHostId[] = expectedHosts.map(
    ({ host }) => host,
  );
  expect(hostIds).toEqual(expectedHostIds);
  expect(SKILL_INSTALL_HOST_IDS.every(isSkillInstallHostId)).toBe(true);
  expect(isSkillInstallHostId("gemini-cli")).toBe(false);

  const discovered = await discoverSkillInstallHosts(f.projectRoot, f.options);
  expect(discovered).toMatchObject(
    expectedHosts.map(({ host, relativeDestination, trust }) => ({
      host,
      destination: path.join(f.projectRoot, relativeDestination),
      discoverability: "verified",
      state: "missing",
      trust,
      ...(trust === "external"
        ? {
            trustNote: expect.stringContaining(
              "Opsx cannot verify or grant it.",
            ),
          }
        : {}),
      targets: [],
    })),
  );
  const profilesOnly = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["claude"],
    },
    f.options,
  );
  expect(profilesOnly.skillHosts.map((host) => host.targets)).toEqual(
    expectedHosts.map(() => []),
  );

  const request = {
    projectRoot: f.projectRoot,
    schemaRoot: f.schemaRoot,
    profiles: [],
    skillHosts: SKILL_INSTALL_HOST_IDS,
  };
  const plan = await previewSkillInstall(request, f.options);
  expect(plan.canApply).toBe(true);
  expect(plan.request.skillHosts).toEqual(
    expectedHosts.map(({ host }) => host).sort(),
  );
  expect(plan.targets).toEqual([]);
  expect(plan.skillHosts).toMatchObject(
    expectedHosts.map(({ host, relativeDestination, trust }) => ({
      host,
      destination: path.join(f.projectRoot, relativeDestination),
      trust,
      targets: [
        {
          relativeTarget: `${relativeDestination}/host-skill`,
          action: "install",
        },
      ],
    })),
  );
  expect(await readdir(f.projectRoot)).toEqual([]);

  const result = await applySkillInstall(plan, f.options);
  expect(result.applied).toBe(true);
  const expectedTargets = expectedHosts.map(
    ({ relativeDestination }) => `${relativeDestination}/host-skill`,
  );
  expect(result.installedTargets).toEqual(expectedTargets);
  for (const target of result.installedTargets) {
    expect(
      await readFile(path.join(f.projectRoot, target, "SKILL.md"), "utf8"),
    ).toBe(skill);
    expect(
      await readFile(
        path.join(f.projectRoot, target, "references/guide.txt"),
        "utf8",
      ),
    ).toBe("kept with the skill\n");
  }
  expect(
    (await discoverSkillInstallHosts(f.projectRoot, f.options)).map(
      (host) => host.state,
    ),
  ).toEqual(expectedHosts.map(() => "ready"));

  const repeated = await previewSkillInstall(request, f.options);
  expect(repeated.canApply).toBe(true);
  expect(
    repeated.skillHosts
      .flatMap((host) => host.targets)
      .map((target) => target.action),
  ).toEqual(expectedHosts.map(() => "noop"));
  expect(
    repeated.skillHosts
      .flatMap((host) => host.targets)
      .map((target) => target.relativeTarget),
  ).toEqual(expectedTargets);
  expect(await applySkillInstall(repeated, f.options)).toMatchObject({
    applied: false,
    installedTargets: [],
    unchangedTargets: expectedTargets,
  });
});

test("a host target that changes after preview invalidates the exact install plan", async () => {
  const f = await fixture("fresh-host-skill\n");
  const skill = `---\nname: fresh-host-skill\ndescription: A freshness fixture.\n---\n\n# Fresh skill\n`;
  await addSkill(f.sourceRoot, "fresh-host-skill", { "SKILL.md": skill });
  const request = {
    projectRoot: f.projectRoot,
    schemaRoot: f.schemaRoot,
    profiles: [],
    skillHosts: ["omp"] as const,
  };
  const plan = await previewSkillInstall(request, f.options);
  expect(
    plan.skillHosts.find((host) => host.host === "omp")?.targets[0]?.state,
  ).toBe("missing");

  const changedTarget = path.join(
    f.projectRoot,
    ".omp/skills/fresh-host-skill",
  );
  await mkdir(changedTarget, { recursive: true });
  await writeFile(path.join(changedTarget, "SKILL.md"), skill);
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_STALE",
  });
  expect(await readFile(path.join(changedTarget, "SKILL.md"), "utf8")).toBe(
    skill,
  );
  await expect(
    readFile(
      path.join(f.projectRoot, ".atomic/skills/fresh-host-skill/SKILL.md"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("a host root shared with a selected profile is identified and blocks all writes", async () => {
  const f = await fixture("shared-host-skill\n");
  const skill = `---\nname: shared-host-skill\ndescription: A shared-target fixture.\n---\n\n# Shared skill\n`;
  await addSkill(f.sourceRoot, "shared-host-skill", { "SKILL.md": skill });
  await writeFile(
    f.profileManifestPath,
    JSON.stringify({
      schemaVersion: 1,
      agents: { custom: { label: "Custom", target: ".omp/skills" } },
    }),
  );
  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: ["custom"],
      skillHosts: ["omp"],
    },
    f.options,
  );
  const host = plan.skillHosts.find((item) => item.host === "omp")!;
  expect(host).toMatchObject({ state: "shared", action: "refuse" });
  expect(host.targets[0]).toMatchObject({ state: "shared", action: "refuse" });
  expect(plan.canApply).toBe(false);
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(await readdir(f.projectRoot)).toEqual([]);
});

test("host preview refuses source skills that violate the native discovery contract", async () => {
  const f = await fixture("bad-metadata-skill\n");
  await addSkill(f.sourceRoot, "bad-metadata-skill", {
    "SKILL.md": `---\nname: other-skill\ndescription: Wrong name.\n---\n\n# Not the declared skill\n`,
  });
  const plan = await previewSkillInstall(
    {
      projectRoot: f.projectRoot,
      schemaRoot: f.schemaRoot,
      profiles: [],
      skillHosts: SKILL_INSTALL_HOST_IDS,
    },
    f.options,
  );
  expect(plan.canApply).toBe(false);
  expect(
    plan.skillHosts
      .flatMap((host) => host.targets)
      .map((target) => target.state),
  ).toEqual(SKILL_INSTALL_HOST_IDS.map(() => "undiscoverable"));
  expect(
    plan.skillHosts
      .flatMap((host) => host.targets)
      .map((target) => target.action),
  ).toEqual(SKILL_INSTALL_HOST_IDS.map(() => "refuse"));
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  expect(await readdir(f.projectRoot)).toEqual([]);
});

test("an unsafe native host destination blocks the whole install without touching safe hosts", async () => {
  const f = await fixture("safe-and-unsafe-hosts\n");
  await addSkill(f.sourceRoot, "safe-and-unsafe-hosts", {
    "SKILL.md":
      "---\nname: safe-and-unsafe-hosts\ndescription: Safe host collision fixture.\n---\n\n# Safe host collision\n",
  });
  await mkdir(path.join(f.projectRoot, ".senpi"), { recursive: true });
  await writeFile(
    path.join(f.projectRoot, ".senpi/skills"),
    "unmanaged file\n",
  );
  const request = {
    projectRoot: f.projectRoot,
    schemaRoot: f.schemaRoot,
    profiles: [],
    skillHosts: ["opencode", "senpi"] as const,
  };

  const plan = await previewSkillInstall(request, f.options);
  expect(plan.canApply).toBe(false);
  expect(
    plan.skillHosts.find((host) => host.host === "opencode")?.targets[0],
  ).toMatchObject({ action: "install", state: "missing" });
  expect(plan.skillHosts.find((host) => host.host === "senpi")).toMatchObject({
    state: "file",
    action: "refuse",
  });
  await expect(applySkillInstall(plan, f.options)).rejects.toMatchObject({
    code: "RESOURCE_BLOCKED",
  });
  await expect(
    readFile(
      path.join(
        f.projectRoot,
        ".opencode/skills/safe-and-unsafe-hosts/SKILL.md",
      ),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(
    await readFile(path.join(f.projectRoot, ".senpi/skills"), "utf8"),
  ).toBe("unmanaged file\n");
});
