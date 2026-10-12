import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const legacySchemaPackage = "@nebulesstech/openspec-schemas";

async function run(args: string[], cwd: string, env?: Record<string, string>) {
  const child = Bun.spawn(args, {
    cwd,
    ...(env ? { env: { ...process.env, ...env } } : {}),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr, pid: child.pid };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value[key]))
    throw new Error(`Expected an object at ${key}.`);
  return value[key];
}

function requiredString(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== "string")
    throw new Error(`Expected a string at ${key}.`);
  return value[key];
}

async function snapshotTree(
  directory: string,
): Promise<Array<{ path: string; bytes: Buffer; mode: number }>> {
  const files: Array<{ path: string; bytes: Buffer; mode: number }> = [];
  const visit = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        await visit(file);
      } else {
        const info = await lstat(file);
        files.push({
          path: path.relative(directory, file),
          bytes: await readFile(file),
          mode: info.mode & 0o777,
        });
      }
    }
  };
  await visit(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function isPresent(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("one packed opsx-schema install carries and uses its bundled resources", async () => {
  const sourceManifest = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  ) as {
    name: string;
  };
  expect(sourceManifest.name).toBe("opsx-schema");

  const tempRoot = await mkdtemp(
    path.join(tmpdir(), "opsx-schema-distribution-"),
  );
  const packDirectory = path.join(tempRoot, "pack");
  const consumerDirectory = path.join(tempRoot, "consumer");
  const projectDirectory = path.join(tempRoot, "project");
  const providerTargetDirectory = path.join(tempRoot, "provider-target");

  try {
    await Promise.all([
      mkdir(packDirectory),
      mkdir(consumerDirectory),
      mkdir(path.join(projectDirectory, "openspec", "changes"), {
        recursive: true,
      }),
      mkdir(providerTargetDirectory),
    ]);
    await writeFile(
      path.join(projectDirectory, "openspec", "config.yaml"),
      "schema: spec-driven\n",
    );

    const pack = await run(
      [
        process.execPath,
        "pm",
        "pack",
        "--destination",
        packDirectory,
        "--quiet",
      ],
      repositoryRoot,
    );
    expect(pack.exitCode, pack.stderr).toBe(0);
    const archives = (await readdir(packDirectory)).filter((name) =>
      name.endsWith(".tgz"),
    );
    expect(archives).toHaveLength(1);
    const archivePath = path.join(packDirectory, archives[0]!);

    await writeFile(
      path.join(consumerDirectory, "package.json"),
      JSON.stringify({ private: true }),
    );
    const install = await run(
      [process.execPath, "add", archivePath],
      consumerDirectory,
    );
    expect(install.exitCode, install.stderr).toBe(0);

    const installedDirectory = path.join(
      consumerDirectory,
      "node_modules",
      sourceManifest.name,
    );
    const installedManifest = JSON.parse(
      await readFile(path.join(installedDirectory, "package.json"), "utf8"),
    ) as {
      name: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    expect(installedManifest.name).toBe("opsx-schema");
    for (const dependencies of [
      installedManifest.dependencies,
      installedManifest.devDependencies,
      installedManifest.optionalDependencies,
      installedManifest.peerDependencies,
    ]) {
      expect(dependencies ?? {}).not.toHaveProperty(legacySchemaPackage);
    }

    const profileManifest = JSON.parse(
      await readFile(path.join(installedDirectory, "opsx-schema.json"), "utf8"),
    ) as {
      schemaVersion: number;
      agents: Record<string, { label: string; target: string }>;
    };
    expect(profileManifest.schemaVersion).toBe(1);
    expect(profileManifest.agents.codex).toMatchObject({
      label: "Codex",
      target: ".agents/skills",
    });

    const schemaManifest = JSON.parse(
      await readFile(
        path.join(installedDirectory, "assets/schemas/manifest.json"),
        "utf8",
      ),
    ) as {
      formatVersion: number;
      schemas: Record<
        string,
        { digest: string; files: Array<{ path: string; sha256: string }> }
      >;
    };
    expect(schemaManifest.formatVersion).toBe(1);
    const intentDrivenRecord = schemaManifest.schemas["intent-driven"];
    const designRecord = schemaManifest.schemas["intent-driven-design"];
    expect(intentDrivenRecord).toBeDefined();
    expect(designRecord).toBeDefined();

    const adapterManifest = JSON.parse(
      await readFile(
        path.join(installedDirectory, "assets/adapters/manifest.json"),
        "utf8",
      ),
    ) as {
      formatVersion: number;
      source: { schema: string };
      files: Array<{ path: string; sha256: string }>;
    };
    expect(adapterManifest.formatVersion).toBe(1);
    expect(adapterManifest.source.schema).toBe("compound-intent-driven");
    expect(adapterManifest.files.map((file) => file.path)).toContain(
      "opsx-ce-work.md",
    );

    const packagedFiles = [
      "LICENSE",
      "docs/commands.md",
      "resources/LICENSE",
      "resources/openspec/schemas/intent-driven/schema.yaml",
      "resources/openspec/schemas/intent-driven/skills.txt",
      "resources/openspec/schemas/intent-driven-design/mcp.yaml",
      "resources/openspec/schemas/compound-intent-driven/adapters/shared/opsx-ce-work.md",
      "resources/.agents/skills/writing-for-agents/SKILL.md",
      "resources/.atomic/prompts/opsx-ce-work.md",
      "resources/.claude/skills/openspec-apply-change/SKILL.md",
      "resources/.omp/skills/openspec-apply-change/SKILL.md",
    ];
    for (const file of packagedFiles)
      await access(path.join(installedDirectory, file));
    expect(
      await isPresent(
        path.join(installedDirectory, "resources/openspec/changes"),
      ),
    ).toBe(false);
    expect(
      await isPresent(
        path.join(installedDirectory, "resources/openspec/specs"),
      ),
    ).toBe(false);

    const binary = path.join(
      consumerDirectory,
      "node_modules",
      ".bin",
      "opsx-schema",
    );
    const help = await run([binary, "--help"], consumerDirectory);
    expect(help.exitCode, help.stderr).toBe(0);

    const bundled = await run(
      [binary, "--json", "schemas", "bundled"],
      consumerDirectory,
    );
    expect(bundled.exitCode, bundled.stderr).toBe(0);
    const bundledEnvelope = JSON.parse(bundled.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: Array<{
        name: string;
        digest: string;
        files: string[];
        skills: string[];
        hasMcp: boolean;
      }>;
    };
    expect(bundledEnvelope.schemaVersion).toBe(1);
    expect(bundledEnvelope.command).toBe("schemas");
    expect(bundledEnvelope.ok).toBe(true);
    const intentDriven = bundledEnvelope.data.find(
      (schema) => schema.name === "intent-driven",
    );
    const intentDrivenDesign = bundledEnvelope.data.find(
      (schema) => schema.name === "intent-driven-design",
    );
    expect(intentDriven).toMatchObject({
      name: "intent-driven",
      digest: intentDrivenRecord!.digest,
      hasMcp: false,
    });
    expect(intentDriven!.files).toEqual(
      expect.arrayContaining(["schema.yaml", "skills.txt"]),
    );
    expect(intentDriven!.skills).toContain("acceptance-test-authoring");
    expect(intentDrivenDesign).toMatchObject({
      name: "intent-driven-design",
      digest: designRecord!.digest,
      hasMcp: true,
    });
    expect(intentDrivenDesign!.files).toContain("mcp.yaml");

    const schemaName = "intent-driven-design";
    const schemaArgs = [
      "--project",
      projectDirectory,
      "--json",
      "schemas",
      "install",
      schemaName,
    ];
    const schemaDestination = path.join(
      projectDirectory,
      "openspec",
      "schemas",
      schemaName,
    );
    const schemaPreview = await run([binary, ...schemaArgs], projectDirectory);
    expect(schemaPreview.exitCode, schemaPreview.stderr).toBe(0);
    const previewEnvelope = JSON.parse(schemaPreview.stdout) as {
      schemaVersion: number;
      ok: boolean;
      data: {
        phase: string;
        plan: { destination: string; digest: string; status: string };
        confirmation: { token: string };
      };
    };
    expect(previewEnvelope.schemaVersion).toBe(1);
    expect(previewEnvelope.ok).toBe(true);
    expect(previewEnvelope.data.phase).toBe("preview");
    expect(previewEnvelope.data.plan.destination).toBe(schemaDestination);
    expect(previewEnvelope.data.plan.digest).toBe(designRecord!.digest);
    expect(previewEnvelope.data.plan.status).toBe("missing");
    expect(previewEnvelope.data.confirmation.token).toBeTruthy();
    expect(await isPresent(schemaDestination)).toBe(false);

    const schemaApply = await run(
      [
        binary,
        ...schemaArgs,
        "--apply-token",
        previewEnvelope.data.confirmation.token,
      ],
      projectDirectory,
    );
    expect(schemaApply.exitCode, schemaApply.stderr).toBe(0);
    const appliedEnvelope = JSON.parse(schemaApply.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: {
        phase: string;
        result: { status: string; destination: string; digest: string };
      };
    };
    expect(appliedEnvelope).toMatchObject({
      schemaVersion: 1,
      command: "schemas install",
      ok: true,
      data: {
        phase: "applied",
        result: {
          status: "installed",
          destination: schemaDestination,
          digest: designRecord!.digest,
        },
      },
    });
    for (const file of designRecord!.files) {
      const packagedContent = await readFile(
        path.join(
          installedDirectory,
          "resources/openspec/schemas",
          schemaName,
          file.path,
        ),
      );
      const installedContent = await readFile(
        path.join(schemaDestination, file.path),
      );
      expect(
        createHash("sha256").update(packagedContent).digest("hex"),
        `package ${file.path}`,
      ).toBe(file.sha256);
      expect(
        createHash("sha256").update(installedContent).digest("hex"),
        `installed ${file.path}`,
      ).toBe(file.sha256);
    }

    const skills = await run(
      [
        binary,
        "--project",
        projectDirectory,
        "--json",
        "skills",
        "inspect",
        schemaName,
      ],
      projectDirectory,
    );
    expect(skills.exitCode, skills.stderr).toBe(0);
    const skillsEnvelope = JSON.parse(skills.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: {
        schema: { name: string };
        bundles: Array<{
          name: string;
          available: boolean;
          declarations: Array<{
            repository: string;
            path: string;
            skill: string;
          }>;
        }>;
        agentProfiles: Array<{ id: string; label: string; target: string }>;
      };
    };
    expect(skillsEnvelope).toMatchObject({
      schemaVersion: 1,
      command: "skills inspect",
      ok: true,
    });
    expect(skillsEnvelope.data.schema.name).toBe(schemaName);
    const defaultBundle = skillsEnvelope.data.bundles.find(
      (bundle) => bundle.name === "default",
    );
    expect(defaultBundle?.available).toBe(true);
    expect(defaultBundle?.declarations).toContainEqual({
      repository: "pbakaus/impeccable",
      path: ".agents/skills/impeccable",
      skill: "impeccable",
    });
    expect(skillsEnvelope.data.agentProfiles).toContainEqual(
      expect.objectContaining({ id: "codex", target: ".agents/skills" }),
    );
    expect(
      await isPresent(path.join(projectDirectory, ".agents", "skills")),
    ).toBe(false);

    const mcpList = await run(
      [
        binary,
        "--project",
        projectDirectory,
        "--json",
        "mcp",
        "list",
        "--schema",
        schemaName,
      ],
      projectDirectory,
    );
    expect(mcpList.exitCode, mcpList.stderr).toBe(0);
    const mcpListEnvelope = JSON.parse(mcpList.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: {
        version: number;
        providers: Array<{
          name: string;
          url: string;
          permissions: { readOnly: boolean };
          auth: string;
          supportedHosts: string[];
        }>;
      };
    };
    expect(mcpListEnvelope).toMatchObject({
      schemaVersion: 1,
      command: "mcp list",
      ok: true,
      data: { version: 1 },
    });
    const inspo = mcpListEnvelope.data.providers.find(
      (provider) => provider.name === "inspo",
    );
    expect(inspo).toMatchObject({
      name: "inspo",
      url: "https://inspomcp.dev/api/mcp",
      permissions: { readOnly: true },
      auth: "none",
      supportedHosts: expect.arrayContaining(["omp"]),
    });
    expect(
      mcpListEnvelope.data.providers.map((provider) => provider.name),
    ).toContain("ui-skills");

    const mcpInspect = await run(
      [
        binary,
        "--project",
        projectDirectory,
        "--json",
        "mcp",
        "inspect",
        "inspo",
        "--schema",
        schemaName,
      ],
      projectDirectory,
    );
    expect(mcpInspect.exitCode, mcpInspect.stderr).toBe(0);
    expect(JSON.parse(mcpInspect.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "mcp inspect",
      ok: true,
      data: {
        name: "inspo",
        url: "https://inspomcp.dev/api/mcp",
        permissions: { readOnly: true },
        auth: "none",
      },
    });

    const mcpPreview = await run(
      [
        binary,
        "--project",
        projectDirectory,
        "--json",
        "mcp",
        "install",
        "inspo",
        "--host",
        "omp",
        "--schema",
        schemaName,
        "--target-dir",
        providerTargetDirectory,
      ],
      projectDirectory,
    );
    expect(mcpPreview.exitCode, mcpPreview.stderr).toBe(0);
    const mcpPreviewEnvelope = JSON.parse(mcpPreview.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: {
        phase: string;
        target: { host: string; targetDir: string; provider: string };
        plan: {
          provider: {
            name: string;
            url: string;
            permissions: { readOnly: boolean };
            auth: string;
          };
          host: string;
          hostPath: string;
          configPath: string | null;
          changed: boolean;
          diff: Array<{ operation: string; before: unknown }>;
        };
      };
    };
    expect(mcpPreviewEnvelope).toMatchObject({
      schemaVersion: 1,
      command: "mcp install",
      ok: true,
      data: {
        phase: "preview",
        target: {
          host: "omp",
          provider: "inspo",
          targetDir: providerTargetDirectory,
        },
        plan: {
          provider: {
            name: "inspo",
            url: "https://inspomcp.dev/api/mcp",
            permissions: { readOnly: true },
            auth: "none",
          },
          host: "omp",
          hostPath: path.join(providerTargetDirectory, ".omp"),
          configPath: path.join(providerTargetDirectory, ".omp", "mcp.json"),
          changed: true,
        },
      },
    });
    expect(mcpPreviewEnvelope.data.plan.diff).toContainEqual(
      expect.objectContaining({ operation: "add", before: null }),
    );
    expect(
      await isPresent(path.join(providerTargetDirectory, ".omp", "mcp.json")),
    ).toBe(false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}, 120_000);

test("extracted CLI previews, applies, and recovers a portable same-name re-pin", async () => {
  const tempRoot = await mkdtemp(
    path.join(repositoryRoot, ".opsx-schema-repin-package-"),
  );
  let completed = false;
  try {
    const packDirectory = path.join(tempRoot, "pack");
    const extracted = path.join(tempRoot, "extracted");
    await mkdir(packDirectory);
    await mkdir(extracted);
    const packed = await run(
      [
        process.execPath,
        "pm",
        "pack",
        "--destination",
        packDirectory,
        "--quiet",
      ],
      repositoryRoot,
    );
    expect(packed.exitCode, packed.stderr).toBe(0);
    const archive = (await readdir(packDirectory)).find((name) =>
      name.endsWith(".tgz"),
    );
    if (!archive) throw new Error("bun pm pack did not create a tarball.");
    const unpack = await run(
      ["tar", "-xzf", path.join(packDirectory, archive), "-C", extracted],
      tempRoot,
    );
    expect(unpack.exitCode, unpack.stderr).toBe(0);

    const packageRoot = path.join(extracted, "package");
    const packageCli = path.join(packageRoot, "src/domain/cli.ts");
    await access(packageCli);
    // Only dependencies are shared; CLI source and assets come from the tarball.
    await symlink(
      path.join(repositoryRoot, "node_modules"),
      path.join(packageRoot, "node_modules"),
      "dir",
    );

    const sourceProject = path.join(tempRoot, "origin-project");
    const applyProject = path.join(tempRoot, "apply-project");
    const recoveryProject = path.join(tempRoot, "recovery-project");
    const schemaRoot = path.join(sourceProject, "openspec/schemas/pin-schema");
    await mkdir(path.join(schemaRoot, "templates"), { recursive: true });
    await mkdir(
      path.join(sourceProject, "openspec/changes/sample/specs/example"),
      { recursive: true },
    );
    await mkdir(
      path.join(sourceProject, "skill-source/.agents/skills/guard-skill"),
      { recursive: true },
    );
    await writeFile(
      path.join(sourceProject, "openspec/config.yaml"),
      "schema: pin-schema\n",
    );
    await writeFile(
      path.join(schemaRoot, "schema.yaml"),
      "name: pin-schema\nversion: 1\nartifacts:\n  - id: proposal\n    generates: proposal.md\n    description: Proposal\n    template: proposal.md\n",
    );
    await writeFile(
      path.join(schemaRoot, "skills.txt"),
      "fixture/skills\t.agents/skills/guard-skill\n",
    );
    await writeFile(
      path.join(schemaRoot, "templates/proposal.md"),
      "## Why\n\nWhy.\n\n## What Changes\n\n- Change.\n\n## Capabilities\n\n### New Capabilities\nNone.\n\n### Modified Capabilities\nNone.\n\n## Impact\n\nFixture.\n",
    );
    await writeFile(
      path.join(
        sourceProject,
        "skill-source/.agents/skills/guard-skill/SKILL.md",
      ),
      "---\nname: guard-skill\ndescription: Fixture.\n---\n\n# Guard\n",
    );
    await writeFile(
      path.join(sourceProject, "openspec/changes/sample/.openspec.yaml"),
      "schema: pin-schema\n",
    );
    await writeFile(
      path.join(sourceProject, "openspec/changes/sample/proposal.md"),
      "## Why\n\nWhy.\n\n## What Changes\n\n- Change.\n\n## Capabilities\n\n### New Capabilities\nNone.\n\n### Modified Capabilities\nNone.\n\n## Impact\n\nFixture.\n",
    );
    await writeFile(
      path.join(sourceProject, "openspec/changes/sample/specs/example/spec.md"),
      "## ADDED Requirements\n\n### Requirement: Example\nThe fixture MUST work.\n\n#### Scenario: Valid\n- **WHEN** checked\n- **THEN** it passes\n",
    );

    const git = async (cwd: string, args: string[]) => {
      const result = await run(["git", ...args], cwd, { GIT_PAGER: "cat" });
      expect(result.exitCode, result.stderr).toBe(0);
      return result;
    };
    await git(sourceProject, ["init", "-b", "main"]);
    await git(sourceProject, ["add", "openspec", "skill-source"]);
    await git(sourceProject, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      "fixture schema",
    ]);

    const setupScript = [
      `import { OpenSpecClient } from ${JSON.stringify(path.join(packageRoot, "src/openspec/client.ts"))};`,
      `import { resolveRevision, retainRevision } from ${JSON.stringify(path.join(packageRoot, "src/revisions/index.ts"))};`,
      `import { recordCreation } from ${JSON.stringify(path.join(packageRoot, "src/provenance/index.ts"))};`,
      `import { previewSkillInstall, applySkillInstall } from ${JSON.stringify(path.join(packageRoot, "src/resources/index.ts"))};`,
      "const root = process.argv[1];",
      'const revision = await resolveRevision(new OpenSpecClient(root), "pin-schema");',
      "await retainRevision(root, revision);",
      'const options = { sourceRoots: { "fixture/skills": root + "/skill-source" } };',
      'const plan = await previewSkillInstall({ projectRoot: root, schemaRoot: revision.source, profiles: [], skillHosts: ["pi"], skillBundle: "default" }, options);',
      'if (!plan.canApply || plan.skillHosts.find(host => host.host === "pi")?.targets[0]?.action !== "install") throw Error(JSON.stringify(plan));',
      "await applySkillInstall(plan, options);",
      'await recordCreation(root, "sample", revision);',
      "console.log(JSON.stringify(revision));",
    ].join("\n");
    const setup = await run(
      [process.execPath, "-e", setupScript, sourceProject],
      tempRoot,
    );
    expect(setup.exitCode, setup.stderr).toBe(0);
    const sourceReceipt = path.join(
      sourceProject,
      "openspec/changes/sample/.opsx-provenance.json",
    );
    const legacyReceipt: unknown = JSON.parse(
      await readFile(sourceReceipt, "utf8"),
    );
    const legacyCreated = requiredRecord(legacyReceipt, "created");
    delete legacyCreated.origin;
    await writeFile(sourceReceipt, JSON.stringify(legacyReceipt));
    await git(sourceProject, ["add", "--all"]);
    await git(sourceProject, [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      "fixture provenance and managed resource",
    ]);
    await git(tempRoot, ["clone", "--quiet", sourceProject, applyProject]);
    await git(tempRoot, ["clone", "--quiet", sourceProject, recoveryProject]);
    await rm(sourceProject, { recursive: true });

    const cli = (project: string, args: string[]) =>
      run(
        [process.execPath, packageCli, "--project", project, "--json", ...args],
        project,
      );
    const base = ["change", "re-pin", "sample", "pin-schema"];
    const provenancePath = (project: string) =>
      path.join(project, "openspec/changes/sample/.opsx-provenance.json");
    const pinPath = (project: string) =>
      path.join(project, "openspec/changes/sample/.openspec.yaml");
    const configPath = (project: string) =>
      path.join(project, "openspec/config.yaml");
    const artifactPaths = (project: string) => [
      path.join(project, "openspec/changes/sample/proposal.md"),
      path.join(project, "openspec/changes/sample/specs/example/spec.md"),
    ];
    const retainedRoot = (project: string) =>
      path.join(project, "openspec/.opsx/revisions/pin-schema");
    const managedRoot = (project: string) =>
      path.join(project, ".pi/skills/guard-skill");
    const ownershipPath = (project: string) =>
      path.join(project, ".openspec/opsx-schema/managed-resources.json");
    const journalPath = (project: string) =>
      path.join(project, "openspec/.opsx/re-pin-journal.json");
    const capture = async (project: string) => ({
      provenance: await readFile(provenancePath(project)),
      pin: await readFile(pinPath(project)),
      config: await readFile(configPath(project)),
      artifacts: await Promise.all(
        artifactPaths(project).map((file) => readFile(file)),
      ),
      retained: await snapshotTree(retainedRoot(project)),
      managed: await snapshotTree(managedRoot(project)),
      ownership: await readFile(ownershipPath(project)),
    });
    const assertPreserved = async (
      project: string,
      before: Awaited<ReturnType<typeof capture>>,
    ) => {
      expect(await readFile(pinPath(project))).toEqual(before.pin);
      expect(await readFile(configPath(project))).toEqual(before.config);
      for (const [index, file] of artifactPaths(project).entries())
        expect(await readFile(file)).toEqual(before.artifacts[index]);
      expect(await snapshotTree(retainedRoot(project))).toEqual(
        before.retained,
      );
      expect(await snapshotTree(managedRoot(project))).toEqual(before.managed);
      expect(await readFile(ownershipPath(project))).toEqual(before.ownership);
    };

    const applyBefore = await capture(applyProject);
    expect(applyBefore.retained.length).toBeGreaterThan(0);
    expect(applyBefore.managed.length).toBeGreaterThan(0);
    expect(applyBefore.managed.every((entry) => entry.bytes.length > 0)).toBe(
      true,
    );
    expect(applyBefore.managed.every((entry) => entry.mode > 0)).toBe(true);
    expect(applyBefore.ownership.length).toBeGreaterThan(0);
    const ownership: unknown = JSON.parse(applyBefore.ownership.toString());
    expect(Object.keys(requiredRecord(ownership, "resources"))).toContain(
      ".pi/skills/guard-skill",
    );

    const tracked = await git(applyProject, [
      "ls-files",
      "--error-unmatch",
      "openspec/schemas/pin-schema/schema.yaml",
    ]);
    expect(tracked.stdout.trim()).toBe(
      "openspec/schemas/pin-schema/schema.yaml",
    );
    const applyPreview = await cli(applyProject, base);
    expect(
      applyPreview.exitCode,
      applyPreview.stderr + applyPreview.stdout,
    ).toBe(0);
    const applyEnvelope: unknown = JSON.parse(applyPreview.stdout);
    const applyData = requiredRecord(applyEnvelope, "data");
    const applyPlan = requiredRecord(applyData, "data");
    expect(applyPlan.ready).toBe(true);
    expect(applyPlan.noOp).toBe(false);
    expect(requiredRecord(applyPlan, "from").digest).toBe(
      requiredRecord(applyPlan, "to").digest,
    );
    const historicalOrigin = requiredRecord(applyPlan, "historicalOrigin");
    expect(historicalOrigin.status).toBe("unknown");
    expect(historicalOrigin.oldLocation).toBe(
      path.join(sourceProject, "openspec/schemas/pin-schema"),
    );
    expect(historicalOrigin.currentLocation).toBe(
      path.join(applyProject, "openspec/schemas/pin-schema"),
    );
    expect(historicalOrigin.warning).toBe(
      "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.",
    );
    const applyConfirmation = requiredRecord(applyData, "confirmation");
    const applyToken = requiredString(applyConfirmation, "token");
    const applyText = requiredString(applyConfirmation, "exactTarget");
    expect(applyText).toContain(requiredString(historicalOrigin, "warning"));
    expect(applyText).toContain(
      `Old location: ${historicalOrigin.oldLocation}`,
    );
    expect(applyText).toContain(
      `Verified current location: ${historicalOrigin.currentLocation}`,
    );
    await assertPreserved(applyProject, applyBefore);
    expect(await isPresent(journalPath(applyProject))).toBe(false);

    for (const args of [
      [...base, "--apply-token", applyToken],
      [...base, "--apply-token", applyToken, "--confirm", "stale confirmation"],
      [...base, "--apply-token", "stale token", "--confirm", applyText],
    ]) {
      const refused = await cli(applyProject, args);
      expect(refused.exitCode).not.toBe(0);
      await assertPreserved(applyProject, applyBefore);
      expect(await readFile(provenancePath(applyProject))).toEqual(
        applyBefore.provenance,
      );
      expect(await isPresent(journalPath(applyProject))).toBe(false);
    }

    const applied = await cli(applyProject, [
      ...base,
      "--apply-token",
      applyToken,
      "--confirm",
      applyText,
    ]);
    expect(applied.exitCode, applied.stderr + applied.stdout).toBe(0);
    expect(requiredRecord(JSON.parse(applied.stdout), "data").phase).toBe(
      "applied",
    );
    const appliedReceiptBytes = await readFile(provenancePath(applyProject));
    const appliedReceipt: unknown = JSON.parse(appliedReceiptBytes.toString());
    const appliedEvents = isRecord(appliedReceipt)
      ? appliedReceipt.rePins
      : undefined;
    expect(appliedEvents).toHaveLength(1);
    if (!Array.isArray(appliedEvents) || !isRecord(appliedEvents[0]))
      throw new Error("Apply did not append exactly one re-pin event.");
    expect(appliedEvents[0].from).toEqual(
      requiredRecord(JSON.parse(applyBefore.provenance.toString()), "created"),
    );
    const originalReceipt: unknown = JSON.parse(
      applyBefore.provenance.toString(),
    );
    expect(
      isRecord(appliedReceipt) ? appliedReceipt.created : undefined,
    ).toEqual(requiredRecord(originalReceipt, "created"));
    for (const key of ["association", "migrations", "establishments"])
      expect(
        isRecord(appliedReceipt) ? appliedReceipt[key] : undefined,
      ).toEqual(isRecord(originalReceipt) ? originalReceipt[key] : undefined);
    expect(await readFile(provenancePath(applyProject))).not.toEqual(
      applyBefore.provenance,
    );
    await assertPreserved(applyProject, applyBefore);
    const healthy = await cli(applyProject, base);
    expect(healthy.exitCode, healthy.stderr + healthy.stdout).toBe(0);
    const healthyData = requiredRecord(
      requiredRecord(JSON.parse(healthy.stdout), "data"),
      "data",
    );
    expect(healthyData.noOp).toBe(true);
    expect(
      requiredRecord(JSON.parse(healthy.stdout), "data").confirmation,
    ).toBe(undefined);
    expect(await readFile(provenancePath(applyProject))).toEqual(
      appliedReceiptBytes,
    );

    const recoveryBefore = await capture(recoveryProject);
    const crashPreview = await cli(recoveryProject, base);
    expect(
      crashPreview.exitCode,
      crashPreview.stderr + crashPreview.stdout,
    ).toBe(0);
    const crashPreviewData = requiredRecord(
      requiredRecord(JSON.parse(crashPreview.stdout), "data"),
      "data",
    );
    expect(crashPreviewData.ready).toBe(true);
    const crashConfirmation = requiredRecord(
      requiredRecord(JSON.parse(crashPreview.stdout), "data"),
      "confirmation",
    );
    const crashToken = requiredString(crashConfirmation, "token");
    const crashText = requiredString(crashConfirmation, "exactTarget");
    expect(crashText).toContain(
      "The old location cannot be verified. The current schema matches the saved schema content.",
    );
    await assertPreserved(recoveryProject, recoveryBefore);
    expect(await readFile(provenancePath(recoveryProject))).toEqual(
      recoveryBefore.provenance,
    );
    expect(await isPresent(journalPath(recoveryProject))).toBe(false);

    const marker = path.join(tempRoot, "crash-boundary.txt");
    const crashHook = path.join(
      repositoryRoot,
      "test/cli/re-pin-recovery-crash-hook.ts",
    );
    const crashed = await run(
      [
        process.execPath,
        "--preload",
        crashHook,
        packageCli,
        "--project",
        recoveryProject,
        "--json",
        ...base,
        "--apply-token",
        crashToken,
        "--confirm",
        crashText,
        "--test-repin-boundary",
        "prepared-journal-parent-sync",
        "--test-repin-marker",
        marker,
      ],
      recoveryProject,
    );
    expect(crashed.exitCode, crashed.stderr).toBe(137);
    expect(crashed.pid).toBeGreaterThan(0);
    expect(await readFile(marker, "utf8")).toBe("prepared-journal-parent-sync");
    expect(await readFile(provenancePath(recoveryProject))).toEqual(
      recoveryBefore.provenance,
    );
    const journal = await readFile(journalPath(recoveryProject));
    expect(JSON.parse(journal.toString())).toMatchObject({
      version: 2,
      state: "prepared",
    });

    const lockPath = path.join(recoveryProject, "openspec/.opsx-switch.lock");
    const lockBytes = await readFile(lockPath);
    const lockIdentity = await lstat(lockPath);
    expect(lockBytes.length).toBeGreaterThan(0);
    const lockedInspection = await cli(recoveryProject, [...base, "--recover"]);
    expect(lockedInspection.exitCode, lockedInspection.stderr).toBe(0);
    expect(
      requiredRecord(
        requiredRecord(JSON.parse(lockedInspection.stdout), "data"),
        "data",
      ).recovery,
    ).toMatchObject({ disposition: "absent", journalState: "prepared" });
    expect(await readFile(lockPath)).toEqual(lockBytes);
    const lockBeforeRelease = await lstat(lockPath);
    expect(lockBeforeRelease.dev).toBe(lockIdentity.dev);
    expect(lockBeforeRelease.ino).toBe(lockIdentity.ino);
    expect(lockBeforeRelease.mode).toBe(lockIdentity.mode);
    expect(await readFile(lockPath)).toEqual(lockBytes);
    await rm(lockPath);

    const freshRecovery = await cli(recoveryProject, [...base, "--recover"]);
    expect(freshRecovery.exitCode, freshRecovery.stderr).toBe(0);
    const freshRecoveryEnvelope: unknown = JSON.parse(freshRecovery.stdout);
    const freshRecoveryData = requiredRecord(
      requiredRecord(freshRecoveryEnvelope, "data"),
      "data",
    );
    expect(requiredRecord(freshRecoveryData, "recovery").disposition).toBe(
      "absent",
    );
    const freshRecoveryConfirmation = requiredRecord(
      requiredRecord(freshRecoveryEnvelope, "data"),
      "confirmation",
    );
    const freshRecoveryToken = requiredString(
      freshRecoveryConfirmation,
      "token",
    );
    const freshRecoveryText = requiredString(
      freshRecoveryConfirmation,
      "exactTarget",
    );
    expect(freshRecoveryToken).not.toBe(crashToken);

    for (const recoveryArgs of [
      [...base, "--recover", "--recovery-token", freshRecoveryToken],
      [
        ...base,
        "--recover",
        "--recovery-token",
        "stale recovery token",
        "--confirm",
        freshRecoveryText,
      ],
      [
        ...base,
        "--recover",
        "--recovery-token",
        freshRecoveryToken,
        "--confirm",
        "stale recovery confirmation",
      ],
    ]) {
      const refused = await cli(recoveryProject, recoveryArgs);
      expect(refused.exitCode).not.toBe(0);
      expect(await readFile(provenancePath(recoveryProject))).toEqual(
        recoveryBefore.provenance,
      );
      expect(await readFile(journalPath(recoveryProject))).toEqual(journal);
    }

    const finalRecoveryPreview = await cli(recoveryProject, [
      ...base,
      "--recover",
    ]);
    expect(finalRecoveryPreview.exitCode, finalRecoveryPreview.stderr).toBe(0);
    const finalRecoveryEnvelope: unknown = JSON.parse(
      finalRecoveryPreview.stdout,
    );
    const finalRecoveryConfirmation = requiredRecord(
      requiredRecord(finalRecoveryEnvelope, "data"),
      "confirmation",
    );
    const recovered = await cli(recoveryProject, [
      ...base,
      "--recover",
      "--recovery-token",
      requiredString(finalRecoveryConfirmation, "token"),
      "--confirm",
      requiredString(finalRecoveryConfirmation, "exactTarget"),
    ]);
    expect(recovered.exitCode, recovered.stderr + recovered.stdout).toBe(0);
    expect(requiredRecord(JSON.parse(recovered.stdout), "data").phase).toBe(
      "applied",
    );
    const recoveredReceipt: unknown = JSON.parse(
      await readFile(provenancePath(recoveryProject), "utf8"),
    );
    if (!isRecord(recoveredReceipt) || !Array.isArray(recoveredReceipt.rePins))
      throw new Error("Recovery did not return a provenance history.");
    expect(recoveredReceipt.rePins).toHaveLength(1);
    expect(recoveredReceipt.created).toEqual(
      requiredRecord(
        JSON.parse(recoveryBefore.provenance.toString()),
        "created",
      ),
    );
    await assertPreserved(recoveryProject, recoveryBefore);
    expect(
      JSON.parse(await readFile(journalPath(recoveryProject), "utf8")),
    ).toMatchObject({
      version: 2,
      state: "complete",
    });
    const completedJournal = await readFile(journalPath(recoveryProject));
    const completedReceipt = await readFile(provenancePath(recoveryProject));
    const completedInspection = await cli(recoveryProject, [
      ...base,
      "--recover",
    ]);
    expect(completedInspection.exitCode).not.toBe(0);
    expect(
      requiredRecord(JSON.parse(completedInspection.stdout), "error").code,
    ).toBe("PREVIEW_BLOCKED");
    expect(
      requiredRecord(
        requiredRecord(
          requiredRecord(JSON.parse(completedInspection.stdout), "data"),
          "data",
        ),
        "recovery",
      ).disposition,
    ).toBe("complete");
    expect(
      requiredRecord(JSON.parse(completedInspection.stdout), "data")
        .confirmation,
    ).toBeUndefined();
    expect(await readFile(journalPath(recoveryProject))).toEqual(
      completedJournal,
    );
    expect(await readFile(provenancePath(recoveryProject))).toEqual(
      completedReceipt,
    );
    completed = true;
  } finally {
    if (completed) await rm(tempRoot, { recursive: true, force: true });
  }
}, 180_000);
