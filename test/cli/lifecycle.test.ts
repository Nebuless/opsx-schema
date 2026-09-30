import { afterEach, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
    expect(provenance?.version).toBe(1);
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
