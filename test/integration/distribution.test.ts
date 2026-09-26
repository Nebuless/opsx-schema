import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const legacySchemaPackage = "@nebulesstech/openspec-schemas";

async function run(args: string[], cwd: string) {
  const child = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
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
  const sourceManifest = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
    name: string;
  };
  expect(sourceManifest.name).toBe("opsx-schema");

  const tempRoot = await mkdtemp(path.join(tmpdir(), "opsx-schema-distribution-"));
  const packDirectory = path.join(tempRoot, "pack");
  const consumerDirectory = path.join(tempRoot, "consumer");
  const projectDirectory = path.join(tempRoot, "project");
  const providerTargetDirectory = path.join(tempRoot, "provider-target");

  try {
    await Promise.all([
      mkdir(packDirectory),
      mkdir(consumerDirectory),
      mkdir(path.join(projectDirectory, "openspec", "changes"), { recursive: true }),
      mkdir(providerTargetDirectory),
    ]);
    await writeFile(path.join(projectDirectory, "openspec", "config.yaml"), "schema: spec-driven\n");

    const pack = await run(
      [process.execPath, "pm", "pack", "--destination", packDirectory, "--quiet"],
      repositoryRoot,
    );
    expect(pack.exitCode, pack.stderr).toBe(0);
    const archives = (await readdir(packDirectory)).filter(name => name.endsWith(".tgz"));
    expect(archives).toHaveLength(1);
    const archivePath = path.join(packDirectory, archives[0]!);

    await writeFile(path.join(consumerDirectory, "package.json"), JSON.stringify({ private: true }));
    const install = await run([process.execPath, "add", archivePath], consumerDirectory);
    expect(install.exitCode, install.stderr).toBe(0);

    const installedDirectory = path.join(consumerDirectory, "node_modules", sourceManifest.name);
    const installedManifest = JSON.parse(await readFile(path.join(installedDirectory, "package.json"), "utf8")) as {
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

    const profileManifest = JSON.parse(await readFile(path.join(installedDirectory, "opsx-schema.json"), "utf8")) as {
      schemaVersion: number;
      agents: Record<string, { label: string; target: string }>;
    };
    expect(profileManifest.schemaVersion).toBe(1);
    expect(profileManifest.agents.codex).toMatchObject({ label: "Codex", target: ".agents/skills" });

    const schemaManifest = JSON.parse(await readFile(path.join(installedDirectory, "assets/schemas/manifest.json"), "utf8")) as {
      formatVersion: number;
      schemas: Record<string, { digest: string; files: Array<{ path: string; sha256: string }> }>;
    };
    expect(schemaManifest.formatVersion).toBe(1);
    const intentDrivenRecord = schemaManifest.schemas["intent-driven"];
    const designRecord = schemaManifest.schemas["intent-driven-design"];
    expect(intentDrivenRecord).toBeDefined();
    expect(designRecord).toBeDefined();

    const adapterManifest = JSON.parse(await readFile(path.join(installedDirectory, "assets/adapters/manifest.json"), "utf8")) as {
      formatVersion: number;
      source: { schema: string };
      files: Array<{ path: string; sha256: string }>;
    };
    expect(adapterManifest.formatVersion).toBe(1);
    expect(adapterManifest.source.schema).toBe("compound-intent-driven");
    expect(adapterManifest.files.map(file => file.path)).toContain("opsx-ce-work.md");

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
    for (const file of packagedFiles) await access(path.join(installedDirectory, file));
    expect(await isPresent(path.join(installedDirectory, "resources/openspec/changes"))).toBe(false);
    expect(await isPresent(path.join(installedDirectory, "resources/openspec/specs"))).toBe(false);

    const binary = path.join(consumerDirectory, "node_modules", ".bin", "opsx-schema");
    const help = await run([binary, "--help"], consumerDirectory);
    expect(help.exitCode, help.stderr).toBe(0);

    const bundled = await run([binary, "--json", "schemas", "bundled"], consumerDirectory);
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
    const intentDriven = bundledEnvelope.data.find(schema => schema.name === "intent-driven");
    const intentDrivenDesign = bundledEnvelope.data.find(schema => schema.name === "intent-driven-design");
    expect(intentDriven).toMatchObject({
      name: "intent-driven",
      digest: intentDrivenRecord!.digest,
      hasMcp: false,
    });
    expect(intentDriven!.files).toEqual(expect.arrayContaining(["schema.yaml", "skills.txt"]));
    expect(intentDriven!.skills).toContain("acceptance-test-authoring");
    expect(intentDrivenDesign).toMatchObject({
      name: "intent-driven-design",
      digest: designRecord!.digest,
      hasMcp: true,
    });
    expect(intentDrivenDesign!.files).toContain("mcp.yaml");

    const schemaName = "intent-driven-design";
    const schemaArgs = ["--project", projectDirectory, "--json", "schemas", "install", schemaName];
    const schemaDestination = path.join(projectDirectory, "openspec", "schemas", schemaName);
    const schemaPreview = await run([binary, ...schemaArgs], projectDirectory);
    expect(schemaPreview.exitCode, schemaPreview.stderr).toBe(0);
    const previewEnvelope = JSON.parse(schemaPreview.stdout) as {
      schemaVersion: number;
      ok: boolean;
      data: { phase: string; plan: { destination: string; digest: string; status: string }; confirmation: { token: string } };
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
      [binary, ...schemaArgs, "--apply-token", previewEnvelope.data.confirmation.token],
      projectDirectory,
    );
    expect(schemaApply.exitCode, schemaApply.stderr).toBe(0);
    const appliedEnvelope = JSON.parse(schemaApply.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: { phase: string; result: { status: string; destination: string; digest: string } };
    };
    expect(appliedEnvelope).toMatchObject({
      schemaVersion: 1,
      command: "schemas install",
      ok: true,
      data: {
        phase: "applied",
        result: { status: "installed", destination: schemaDestination, digest: designRecord!.digest },
      },
    });
    for (const file of designRecord!.files) {
      const packagedContent = await readFile(path.join(installedDirectory, "resources/openspec/schemas", schemaName, file.path));
      const installedContent = await readFile(path.join(schemaDestination, file.path));
      expect(createHash("sha256").update(packagedContent).digest("hex"), `package ${file.path}`).toBe(file.sha256);
      expect(createHash("sha256").update(installedContent).digest("hex"), `installed ${file.path}`).toBe(file.sha256);
    }

    const skills = await run(
      [binary, "--project", projectDirectory, "--json", "skills", "inspect", schemaName],
      projectDirectory,
    );
    expect(skills.exitCode, skills.stderr).toBe(0);
    const skillsEnvelope = JSON.parse(skills.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: {
        schema: { name: string };
        bundles: Array<{ name: string; available: boolean; declarations: Array<{ repository: string; path: string; skill: string }> }>;
        agentProfiles: Array<{ id: string; label: string; target: string }>;
      };
    };
    expect(skillsEnvelope).toMatchObject({ schemaVersion: 1, command: "skills inspect", ok: true });
    expect(skillsEnvelope.data.schema.name).toBe(schemaName);
    const defaultBundle = skillsEnvelope.data.bundles.find(bundle => bundle.name === "default");
    expect(defaultBundle?.available).toBe(true);
    expect(defaultBundle?.declarations).toContainEqual({
      repository: "pbakaus/impeccable",
      path: ".agents/skills/impeccable",
      skill: "impeccable",
    });
    expect(skillsEnvelope.data.agentProfiles).toContainEqual(expect.objectContaining({ id: "codex", target: ".agents/skills" }));
    expect(await isPresent(path.join(projectDirectory, ".agents", "skills"))).toBe(false);

    const mcpList = await run(
      [binary, "--project", projectDirectory, "--json", "mcp", "list", "--schema", schemaName],
      projectDirectory,
    );
    expect(mcpList.exitCode, mcpList.stderr).toBe(0);
    const mcpListEnvelope = JSON.parse(mcpList.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: { version: number; providers: Array<{ name: string; url: string; permissions: { readOnly: boolean }; auth: string; supportedHosts: string[] }> };
    };
    expect(mcpListEnvelope).toMatchObject({ schemaVersion: 1, command: "mcp list", ok: true, data: { version: 1 } });
    const inspo = mcpListEnvelope.data.providers.find(provider => provider.name === "inspo");
    expect(inspo).toMatchObject({
      name: "inspo",
      url: "https://inspomcp.dev/api/mcp",
      permissions: { readOnly: true },
      auth: "none",
      supportedHosts: expect.arrayContaining(["omp"]),
    });
    expect(mcpListEnvelope.data.providers.map(provider => provider.name)).toContain("ui-skills");

    const mcpInspect = await run(
      [binary, "--project", projectDirectory, "--json", "mcp", "inspect", "inspo", "--schema", schemaName],
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

    const mcpPreview = await run([
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
    ], projectDirectory);
    expect(mcpPreview.exitCode, mcpPreview.stderr).toBe(0);
    const mcpPreviewEnvelope = JSON.parse(mcpPreview.stdout) as {
      schemaVersion: number;
      command: string;
      ok: boolean;
      data: {
        phase: string;
        target: { host: string; targetDir: string; provider: string };
        plan: {
          provider: { name: string; url: string; permissions: { readOnly: boolean }; auth: string };
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
        target: { host: "omp", provider: "inspo", targetDir: providerTargetDirectory },
        plan: {
          provider: { name: "inspo", url: "https://inspomcp.dev/api/mcp", permissions: { readOnly: true }, auth: "none" },
          host: "omp",
          hostPath: path.join(providerTargetDirectory, ".omp"),
          configPath: path.join(providerTargetDirectory, ".omp", "mcp.json"),
          changed: true,
        },
      },
    });
    expect(mcpPreviewEnvelope.data.plan.diff).toContainEqual(expect.objectContaining({ operation: "add", before: null }));
    expect(await isPresent(path.join(providerTargetDirectory, ".omp", "mcp.json"))).toBe(false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}, 120_000);
