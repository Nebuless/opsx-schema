import { afterEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChange } from "../../src/cli/create.ts";
import {
  getArtifactInstructions,
  getChangeStatus,
  validateChangeAction,
} from "../../src/cli/read.ts";
import { archiveChange } from "../../src/cli/archive.ts";
import {
  handoffChangeSchema,
  previewSchemaHandoff,
} from "../../src/cli/handoff.ts";
import { changeDirectory, listArchived } from "../../src/archive/index.ts";
import { readProvenance } from "../../src/provenance/index.ts";
import { checkRevision } from "../../src/revisions/index.ts";
import { resolveRevision } from "../../src/revisions/index.ts";
import {
  loadAgentProfileDigest,
  loadSkillBundles,
} from "../../src/resources/index.ts";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import {
  acquireProjectMutationLock,
  withProjectMutationLock,
} from "../../src/project-lock.ts";

const fixtures: string[] = [];
const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "opsx-cli-fixture-"));
  fixtures.push(root);
  await mkdir(path.join(root, "openspec", "changes"), { recursive: true });
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  return root;
}

async function worktreeFixture(): Promise<string> {
  const root = await mkdtemp(path.join(import.meta.dir, ".opsx-task2.1-"));
  fixtures.push(root);
  await mkdir(path.join(root, "openspec", "changes"), { recursive: true });
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  return root;
}

async function localSchemaFixture(tracked: boolean): Promise<{
  root: string;
  source: string;
  recorded: { name: string; source: string; digest: string };
}> {
  const root = await worktreeFixture();
  const client = new OpenSpecClient(root);
  const defaultRevision = await resolveRevision(client, "spec-driven");
  const source = path.join(root, "openspec", "schemas", "legacy-schema");
  await cp(defaultRevision.source, source, { recursive: true });
  if (tracked) {
    execFileSync("git", ["init", "--quiet", "-b", "main"], { cwd: root });
    execFileSync("git", ["add", "openspec/schemas/legacy-schema"], {
      cwd: root,
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ],
      { cwd: root },
    );
  }
  const live = await resolveRevision(client, "legacy-schema");
  return {
    root,
    source,
    recorded: {
      name: live.name,
      source: live.source,
      digest: live.digest,
    },
  };
}

async function projectTree(root: string): Promise<string[]> {
  const entries: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const target = path.join(directory, entry.name);
      const relative = path.relative(root, target);
      if (entry.isDirectory()) {
        entries.push(`directory:${relative}`);
        await visit(target);
      } else if (entry.isFile()) {
        entries.push(
          `file:${relative}:${(await readFile(target)).toString("base64")}`,
        );
      } else if (entry.isSymbolicLink()) {
        entries.push(`link:${relative}:${await readlink(target)}`);
      }
    }
  };
  await visit(root);
  return entries.sort();
}

test("project mutation lock is exclusive and releases after callback failure", async () => {
  const root = await fixture();
  const release = await acquireProjectMutationLock(root);
  await expect(
    readFile(path.join(root, "openspec", ".opsx-switch.lock"), "utf8"),
  ).resolves.toMatch(/^[0-9a-f-]+\n$/);
  await expect(
    withProjectMutationLock(root, async () => "unreachable"),
  ).rejects.toMatchObject({ code: "PROJECT_LOCKED" });
  await release();

  await expect(
    withProjectMutationLock(root, async () => {
      throw new Error("callback failed");
    }),
  ).rejects.toThrow("callback failed");
  await expect(
    withProjectMutationLock(root, async () => "released"),
  ).resolves.toBe("released");
});

async function installCompoundSchema(root: string): Promise<void> {
  const destination = path.join(
    root,
    "openspec",
    "schemas",
    "compound-intent-driven",
  );
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(
    path.join(repository, "openspec", "schemas", "compound-intent-driven"),
    destination,
    { recursive: true },
  );
}

async function completeArchiveFixture(
  root: string,
  change: string,
): Promise<void> {
  const directory = await changeDirectory(root, change);
  await writeFile(
    path.join(directory, "proposal.md"),
    "## Why\n\nVerify archive behavior.\n\n## What Changes\n\n- Archive fixture behavior.\n\n## Capabilities\n\n### New Capabilities\n- archive-proof: Verify archive completion.\n\n### Modified Capabilities\nNone.\n\n## Impact\n\nTemporary test fixture only.\n",
  );
  await mkdir(path.join(directory, "specs", "archive-proof"), {
    recursive: true,
  });
  await writeFile(
    path.join(directory, "specs", "archive-proof", "spec.md"),
    "# archive-proof\n\n## ADDED Requirements\n### Requirement: Complete fixtures can be archived\nThe command SHALL preserve the completed change.\n#### Scenario: Archive succeeds\n- **WHEN** a complete change is archived\n- **THEN** it appears in the archive.\n",
  );
  await writeFile(
    path.join(directory, "design.md"),
    "## Context\n\nTemporary validation fixture.\n\n## Goals / Non-Goals\n\n**Goals:** Exercise archive.\n\n**Non-Goals:** Product behavior.\n\n## Decisions\n\nUse fixture files.\n\n## Risks / Trade-offs\n\nNone.\n",
  );
  await writeFile(
    path.join(directory, "tasks.md"),
    "## 1. Verify\n\n- [x] 1.1 Create valid fixture.\n",
  );
}

test(
  "creation is preview-only until its exact token and stores a retained revision receipt",
  async () => {
    const root = await fixture();
    const input = {
      change: "cli-smoke",
      description: "CLI lifecycle fixture",
      goal: "Exercise the OpenSpec adapter",
    };
    const preview = await createChange(root, input);
    expect(preview.ok && preview.phase).toBe("preview");
    if (!preview.ok || preview.phase !== "preview")
      throw new Error("Expected creation preview");
    expect(preview.data).toMatchObject({
      associationSource: "no-skills",
      associationEvidence: null,
    });
    expect(preview.confirmation?.exactTarget).toContain("cli-smoke");
    await expect(changeDirectory(root, "cli-smoke")).rejects.toThrow();

    const denied = await createChange(root, input, {
      applyToken: `${preview.confirmation!.token}-wrong`,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error.code).toBe("APPLY_TOKEN_INVALID");

    const applied = await createChange(root, input, {
      applyToken: preview.confirmation!.token,
    });
    expect(applied.ok && applied.phase).toBe("applied");
    if (!applied.ok || applied.phase !== "applied")
      throw new Error("Expected creation receipt");
    const directory = await changeDirectory(root, "cli-smoke");
    const provenance = await readProvenance(directory);
    expect(provenance?.version).toBe(2);
    expect(provenance?.establishments).toHaveLength(1);
    expect(provenance?.created?.name).toBe("spec-driven");
    expect(provenance?.association).toEqual(applied.data.association);
    expect(provenance?.association?.effectiveRevision).toEqual(
      provenance?.created ?? undefined,
    );
    expect(provenance?.association?.profiles).toEqual([]);
    expect(provenance?.association?.skillHosts).toEqual([]);
    expect(provenance?.association?.manifestDigests.agentProfiles).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(provenance?.association?.manifestDigests.schemaSkills).toMatch(
      /^[a-f0-9]{64}$/,
    );
    const retained = await checkRevision(
      root,
      provenance!.created!,
      new OpenSpecClient(root),
    );
    expect(retained.retained).toBe(true);

    const status = await getChangeStatus(root, "cli-smoke");
    expect(status.ok && status.phase).toBe("read");
    const instructions = await getArtifactInstructions(
      root,
      "cli-smoke",
      "proposal",
    );
    expect(instructions.ok && instructions.phase).toBe("read");
    const validation = await validateChangeAction(root, "cli-smoke");
    expect(validation.ok && validation.phase).toBe("read");
  },
  { timeout: 30_000 },
);

test(
  "creation refuses a skill-bearing schema without a verified installation selection",
  async () => {
    const root = await fixture();
    await installCompoundSchema(root);
    const created = await createChange(root, {
      change: "unverified-skills",
      description: "Unverified skills fixture",
      schema: "compound-intent-driven",
    });
    expect(created.ok).toBe(false);
    if (!created.ok)
      expect(created.error.code).toBe(
        "RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN",
      );
    await expect(changeDirectory(root, "unverified-skills")).rejects.toThrow();
  },
  { timeout: 30_000 },
);

test(
  "archive refuses a stale preview before invoking native archive",
  async () => {
    const root = await fixture();
    const created = await createChange(root, {
      change: "archive-smoke",
      description: "Archive fixture",
    });
    expect(created.ok && created.phase).toBe("preview");
    if (!created.ok || created.phase !== "preview")
      throw new Error("Expected create preview");
    const createApplied = await createChange(
      root,
      { change: "archive-smoke", description: "Archive fixture" },
      { applyToken: created.confirmation!.token },
    );
    expect(createApplied.ok).toBe(true);

    const preview = await archiveChange(root, "archive-smoke");
    expect(preview.ok && preview.phase).toBe("preview");
    if (!preview.ok || preview.phase !== "preview")
      throw new Error("Expected archive preview");
    const directory = await changeDirectory(root, "archive-smoke");
    await writeFile(
      path.join(directory, "README.md"),
      "changed after the preview\n",
    );
    const attempted = await archiveChange(root, "archive-smoke", {
      applyToken: preview.confirmation!.token,
    });
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) expect(attempted.error.code).toBe("STALE_PREVIEW");
    await expect(changeDirectory(root, "archive-smoke")).resolves.toBe(
      directory,
    );
  },
  { timeout: 30_000 },
);

test(
  "archive applies the guarded native command and confirms its archive record",
  async () => {
    const root = await fixture();
    const input = {
      change: "native-archive",
      description: "Native archive fixture",
    };
    const createPreview = await createChange(root, input);
    expect(createPreview.ok && createPreview.phase).toBe("preview");
    if (!createPreview.ok || createPreview.phase !== "preview")
      throw new Error("Expected create preview");
    const created = await createChange(root, input, {
      applyToken: createPreview.confirmation!.token,
    });
    expect(created.ok && created.phase).toBe("applied");
    await completeArchiveFixture(root, input.change);
    const validation = await validateChangeAction(root, input.change);
    expect(validation.ok && validation.data.ok).toBe(true);

    const preview = await archiveChange(root, input.change);
    expect(preview.ok && preview.phase).toBe("preview");
    if (!preview.ok || preview.phase !== "preview")
      throw new Error("Expected archive preview");
    expect(preview.confirmation?.exactTarget).toContain(input.change);
    const release = await acquireProjectMutationLock(root);
    try {
      const locked = await archiveChange(root, input.change, {
        applyToken: preview.confirmation!.token,
      });
      expect(locked.ok).toBe(false);
      if (!locked.ok) expect(locked.error.code).toBe("PROJECT_LOCKED");
      await expect(changeDirectory(root, input.change)).resolves.toBe(
        path.join(root, "openspec", "changes", input.change),
      );
    } finally {
      await release();
    }
    const archived = await archiveChange(root, input.change, {
      applyToken: preview.confirmation!.token,
    });
    expect(archived.ok && archived.phase).toBe("applied");
    if (!archived.ok || archived.phase !== "applied")
      throw new Error("Expected archive receipt");
    expect("archived" in archived.data && archived.data.archived).toBe(true);
    expect(
      (await listArchived(root)).some((record) =>
        record.name.endsWith("-" + input.change),
      ),
    ).toBe(true);
    await expect(changeDirectory(root, input.change)).rejects.toMatchObject({
      code: "CHANGE_NOT_FOUND",
    });
  },
  { timeout: 30_000 },
);

test(
  "handoff discloses missing origin and blocks invalid external artifact content without changing the pin",
  async () => {
    const root = await fixture();
    await installCompoundSchema(root);
    const directory = path.join(root, "openspec", "changes", "handoff-smoke");
    await mkdir(directory);
    await writeFile(
      path.join(directory, ".openspec.yaml"),
      "schema: spec-driven\n",
    );
    await writeFile(
      path.join(directory, "proposal.md"),
      "external editor wrote invalid proposal content\n",
    );
    const before = await readFile(
      path.join(directory, ".openspec.yaml"),
      "utf8",
    );
    const preview = await previewSchemaHandoff(
      root,
      "handoff-smoke",
      "compound-intent-driven",
    );
    expect(preview.ok && preview.phase).toBe("preview");
    if (!preview.ok || preview.phase !== "preview")
      throw new Error("Expected handoff preflight");
    expect(preview.data.ready).toBe(false);
    expect(preview.data.validation.ok).toBe(false);
    expect(preview.confirmation).toBeUndefined();
    const after = await readFile(
      path.join(directory, ".openspec.yaml"),
      "utf8",
    );
    expect(after).toBe(before);

    const attempted = await handoffChangeSchema(
      root,
      "handoff-smoke",
      "compound-intent-driven",
      { applyToken: "not-a-preview-token" },
    );
    expect(attempted.ok).toBe(false);
    if (!attempted.ok)
      expect(attempted.error.code).toBe("TARGET_VALIDATION_FAILED");
  },
  { timeout: 30_000 },
);

test(
  "handoff refuses an unresolved existing pin instead of falling back to the default",
  async () => {
    const root = await fixture();
    const created = await createChange(root, {
      change: "missing-pin",
      description: "Missing pin fixture",
    });
    expect(created.ok && created.phase).toBe("preview");
    if (!created.ok || created.phase !== "preview")
      throw new Error("Expected create preview");
    const applied = await createChange(
      root,
      { change: "missing-pin", description: "Missing pin fixture" },
      { applyToken: created.confirmation!.token },
    );
    expect(applied.ok).toBe(true);
    const directory = await changeDirectory(root, "missing-pin");
    const metadata = await readFile(
      path.join(directory, ".openspec.yaml"),
      "utf8",
    );
    await writeFile(
      path.join(directory, ".openspec.yaml"),
      "schema: missing-schema\n",
    );
    const preview = await previewSchemaHandoff(
      root,
      "missing-pin",
      "spec-driven",
    );
    expect(preview.ok).toBe(false);
    const unchanged = await readFile(
      path.join(directory, ".openspec.yaml"),
      "utf8",
    );
    expect(unchanged).not.toBe(metadata);
    expect(unchanged).toBe("schema: missing-schema\n");
  },
  { timeout: 30_000 },
);

test("legacy association mismatch is refused before reconcile writes retained state", async () => {
  const { root, source, recorded } = await localSchemaFixture(false);
  const directory = path.join(root, "openspec", "changes", "legacy-pin");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, ".openspec.yaml"),
    "schema: legacy-schema\n",
  );
  const catalog = await loadSkillBundles(source);
  const association = {
    version: 1 as const,
    effectiveRevision: recorded,
    profiles: ["codex"],
    skillHosts: [],
    skillBundle: "default" as const,
    manifestDigests: {
      agentProfiles: await loadAgentProfileDigest(),
      schemaSkills: catalog.manifestDigests.skills,
      skillBundles: catalog.manifestDigests.profiles,
    },
  };
  await writeFile(
    path.join(directory, ".opsx-provenance.json"),
    JSON.stringify({
      version: 1,
      created: recorded,
      migrations: [],
      association,
    }),
  );
  const cli = path.resolve(import.meta.dir, "../../src/domain/cli.ts");
  const args = [
    cli,
    "--project",
    root,
    "skills",
    "reconcile",
    "legacy-pin",
    "--revision-digest",
    recorded.digest,
    "--bundle",
    "default",
    "--json",
  ];
  const before = await projectTree(root);
  const preview = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
  expect(preview.error).toBeUndefined();
  const parsedPreview = JSON.parse(preview.stdout);
  const applyToken = parsedPreview.data?.confirmation?.token ?? "stale-token";
  const supplied = spawnSync(
    process.execPath,
    [...args.slice(0, -1), "--apply-token", applyToken, "--json"],
    { cwd: root, encoding: "utf8" },
  );
  expect(supplied.error).toBeUndefined();
  const after = await projectTree(root);
  const actual = {
    previewStatus: preview.status,
    previewCode: JSON.parse(preview.stdout).error?.code ?? null,
    suppliedStatus: supplied.status,
    suppliedCode: JSON.parse(supplied.stdout).error?.code ?? null,
    treeUnchanged: JSON.stringify(after) === JSON.stringify(before),
  };
  expect(actual).toEqual({
    previewStatus: 1,
    previewCode: "PROVENANCE_ASSOCIATION_MISMATCH",
    suppliedStatus: 1,
    suppliedCode: "PROVENANCE_ASSOCIATION_MISMATCH",
    treeUnchanged: true,
  });
}, 30_000);

test("same-selection reconcile upgrades legacy history while retaining its historical ref", async () => {
  const { root, source, recorded } = await localSchemaFixture(true);
  const directory = path.join(root, "openspec", "changes", "legacy-pin");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, ".openspec.yaml"),
    "schema: legacy-schema\n",
  );
  const catalog = await loadSkillBundles(source);
  const association = {
    version: 1 as const,
    effectiveRevision: recorded,
    profiles: [],
    skillHosts: [],
    skillBundle: "default" as const,
    manifestDigests: {
      agentProfiles: await loadAgentProfileDigest(),
      schemaSkills: catalog.manifestDigests.skills,
      skillBundles: catalog.manifestDigests.profiles,
    },
  };
  await writeFile(
    path.join(directory, ".opsx-provenance.json"),
    JSON.stringify({
      version: 1,
      created: recorded,
      migrations: [],
      association,
    }),
  );
  const snapshot = path.join(
    root,
    "openspec",
    ".opsx",
    "revisions",
    recorded.name,
    recorded.digest,
    "schema.yaml",
  );
  await expect(readFile(snapshot)).rejects.toMatchObject({ code: "ENOENT" });

  const cli = path.resolve(import.meta.dir, "../../src/domain/cli.ts");
  const args = [
    cli,
    "--project",
    root,
    "skills",
    "reconcile",
    "legacy-pin",
    "--revision-digest",
    recorded.digest,
    "--bundle",
    "default",
    "--json",
  ];
  const preview = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
  expect(preview.error).toBeUndefined();
  expect(preview.status, preview.stderr + preview.stdout).toBe(0);
  const previewEnvelope = JSON.parse(preview.stdout);
  expect(previewEnvelope.ok, preview.stdout).toBe(true);
  expect(previewEnvelope.data.association).toEqual(association);
  const token = previewEnvelope.data.confirmation.token as string;
  const applied = spawnSync(
    process.execPath,
    [...args.slice(0, -1), "--apply-token", token, "--json"],
    { cwd: root, encoding: "utf8" },
  );
  expect(applied.error).toBeUndefined();
  expect(applied.status, applied.stderr + applied.stdout).toBe(0);
  expect(JSON.parse(applied.stdout).data.phase).toBe("applied");

  const provenance = await readProvenance(directory);
  expect(provenance?.version).toBe(2);
  expect(provenance?.created).toEqual(recorded);
  expect(provenance?.association).toEqual(association);
  expect(provenance?.establishments).toEqual([
    {
      afterMigrationCount: 0,
      afterRePinCount: 0,
      association,
    },
  ]);
  await expect(readFile(snapshot, "utf8")).resolves.toContain(
    "name: spec-driven",
  );
}, 30_000);
