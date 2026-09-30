import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applySkillReplacement,
  applySkillRestore,
  inspectSkillReplacement,
  previewSkillReplacement,
  previewSkillRestore,
  type ActiveSkillPin,
  type SkillReplacementRequest,
  type ResourceRuntimeOptions,
} from "../../src/resources/index.ts";

const created: string[] = [];

interface Fixture {
  root: string;
  projectRoot: string;
  schemaRoot: string;
  target: string;
  options: ResourceRuntimeOptions;
  request: SkillReplacementRequest;
  pins: ActiveSkillPin[];
}

async function fixture(projectRootOverride?: string): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-replacement-"));
  created.push(root);
  const projectRoot = projectRootOverride ?? path.join(root, "project");
  const schemaRoot = path.join(root, "schema");
  const sourceRoot = path.join(root, "source");
  const profileManifestPath = path.join(root, "opsx-schema.json");
  const target = ".agents/skills/sample-skill";
  await Promise.all([
    mkdir(path.join(projectRoot, "openspec"), { recursive: true }),
    mkdir(path.join(projectRoot, ".agents/skills"), { recursive: true }),
    mkdir(path.join(schemaRoot), { recursive: true }),
    mkdir(path.join(sourceRoot, ".agents/skills/sample-skill"), {
      recursive: true,
    }),
  ]);
  await writeFile(
    path.join(projectRoot, "openspec/config.yaml"),
    "schema: spec-driven\n",
  );
  await writeFile(path.join(schemaRoot, "skills.txt"), "sample-skill\n");
  await writeFile(
    profileManifestPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        agents: {
          codex: { label: "Codex", target: ".agents/skills" },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(sourceRoot, ".agents/skills/sample-skill/SKILL.md"),
    "# Declared skill\nnew content\n",
  );
  await writeFile(
    path.join(sourceRoot, ".agents/skills/sample-skill/blob.bin"),
    new Uint8Array([0, 1, 2, 255]),
  );
  await mkdir(path.join(projectRoot, target), { recursive: true });
  await writeFile(
    path.join(projectRoot, `${target}/SKILL.md`),
    "# Local skill\nkeep this backup\n",
  );
  await writeFile(
    path.join(projectRoot, `${target}/blob.bin`),
    new Uint8Array([0, 7, 8]),
  );
  const pins: ActiveSkillPin[] = [];
  const options: ResourceRuntimeOptions = {
    profileManifestPath,
    sourceRoots: { "intent-driven-dev/skills": sourceRoot },
    resolveActivePins: async () => pins,
    resolveInstalledSchema: async () => ({
      name: "fixture-schema",
      path: schemaRoot,
      shadows: [],
    }),
  };
  const request = {
    projectRoot,
    schema: "fixture-schema",
    schemaRoot,
    bundle: "default" as const,
    target,
    backupId: "sample-backup",
  };
  return { root, projectRoot, schemaRoot, target, options, request, pins };
}

async function simulateOriginalMoveCrash(
  f: Fixture,
  phase: "target-moving-original" | "target-original-moved",
) {
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const rollback = path.join(
    f.projectRoot,
    ...applied.receipt.rollbackPath.split("/"),
  );
  const stage = path.join(
    f.projectRoot,
    ...applied.receipt.stagePath.split("/"),
  );
  await cp(
    path.join(f.projectRoot, ...applied.receipt.backupPath.split("/")),
    rollback,
    { recursive: true },
  );
  await cp(path.join(f.root, "source/.agents/skills/sample-skill"), stage, {
    recursive: true,
  });
  const receipt = { ...applied.receipt, phase };
  await writeFile(applied.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  await rm(path.join(f.projectRoot, f.target), { recursive: true });
  await rm(
    path.join(f.projectRoot, ".openspec/opsx-schema/managed-resources.json"),
    { force: true },
  );
  return { applied, rollback, stage };
}

async function addUnrelatedTarget(f: Fixture): Promise<string> {
  const target = path.join(
    f.projectRoot,
    ".agents/skills/unrelated-skill/SKILL.md",
  );
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "unrelated target must stay unchanged\n");
  return target;
}

async function writeIncompleteSwitchJournal(f: Fixture): Promise<void> {
  const directory = path.join(f.projectRoot, "openspec/.opsx");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "switch-journal.json"),
    `${JSON.stringify(
      {
        version: 1,
        id: "resource-test",
        state: "partial",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:01.000Z",
        root: f.projectRoot,
        request: { schema: "fixture-schema", profiles: [], migrations: [] },
        previewToken: "token",
        oldDefault: "spec-driven",
        targetDefault: "fixture-schema",
        actions: [
          {
            id: "install-skills",
            kind: "skills.install",
            status: "running",
            targets: [path.join(f.projectRoot, ...f.target.split("/"))],
            intent: "install declared skills",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

interface PhaseFault {
  options: ResourceRuntimeOptions;
  arm: () => void;
  triggered: () => boolean;
}

function injectPhaseFault(
  f: Fixture,
  phase: string,
  fault: (
    receipt: Record<string, unknown>,
    matchingCall: number,
  ) => Promise<void> | void,
  phaseCalls: number | readonly number[] = 1,
): PhaseFault {
  const receiptPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements",
    f.request.backupId,
    "receipt.json",
  );
  let armed = false;
  let triggered = false;
  let matchingCalls = 0;
  return {
    options: {
      ...f.options,
      resolveActivePins: async (root) => {
        const pins = await f.options.resolveActivePins!(root);
        if (!armed) return pins;
        try {
          const receipt = JSON.parse(
            readFileSync(receiptPath, "utf8"),
          ) as Record<string, unknown>;
          if (receipt.phase === phase) {
            matchingCalls += 1;
            const selected = Array.isArray(phaseCalls)
              ? phaseCalls.includes(matchingCalls)
              : matchingCalls === phaseCalls;
            if (selected) {
              await fault(receipt, matchingCalls);
              triggered = true;
            }
          }
        } catch {
          // No receipt exists during preview and initial plan revalidation.
        }
        return pins;
      },
    },
    arm: () => {
      armed = true;
    },
    triggered: () => triggered,
  };
}

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("replacement preview inventories unmanaged content and inspectable restore preserves backup", async () => {
  const f = await fixture();
  const preview = await previewSkillReplacement(f.request, f.options);
  expect(preview.canApply).toBe(true);
  expect(preview.aliases).toContainEqual({
    kind: "profile",
    id: "codex",
    target: f.target,
  });
  expect(preview.inventory).toContainEqual(
    expect.objectContaining({
      path: "SKILL.md",
      oldDigest: expect.any(String),
      newDigest: expect.any(String),
    }),
  );
  expect(preview.diff.text).toContain("# Local skill");
  expect(preview.diff.text).toContain("# Declared skill");
  expect(preview.diff.binaryFiles).toContain("blob.bin");

  const applied = await applySkillReplacement(
    preview,
    preview.token,
    f.options,
  );
  expect(applied.phase).toBe("complete");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
  expect(
    await readFile(
      path.join(f.projectRoot, applied.receipt.backupPath, "SKILL.md"),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(
    (await inspectSkillReplacement(f.projectRoot, f.request.backupId)).observed
      .backupDigest,
  ).toBe(preview.oldDigest);

  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  expect(restore.canApply).toBe(true);
  const restored = await applySkillRestore(restore, restore.token, f.options);
  expect(restored.receipt.restore?.phase).toBe("complete");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(
    await readFile(
      path.join(f.projectRoot, applied.receipt.backupPath, "SKILL.md"),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});

test("byte-identical unmanaged target requires explicit replacement review", async () => {
  const f = await fixture();
  const source = path.join(f.root, "source/.agents/skills/sample-skill");
  const target = path.join(f.projectRoot, f.target);
  await rm(target, { recursive: true });
  await cp(source, target, { recursive: true });

  const preview = await previewSkillReplacement(f.request, f.options);
  expect(preview.canApply).toBe(true);
  expect(preview.oldDigest).toBe(preview.sourceDigest);
  const applied = await applySkillReplacement(
    preview,
    preview.token,
    f.options,
  );
  expect(applied.phase).toBe("complete");
  expect(applied.observed.backupDigest).toBe(preview.oldDigest);
  expect(applied.observed.ownershipMatchesAfter).toBe(true);
});

test("replacement refuses stale target, occupied backup id, and newly required target", async () => {
  const f = await fixture();
  const preview = await previewSkillReplacement(f.request, f.options);
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "external edit\n",
  );
  await expect(
    applySkillReplacement(preview, "wrong-token", f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_STALE" });
  await expect(
    applySkillReplacement(preview, preview.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_STALE" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("external edit\n");

  const g = await fixture();
  const nextPreview = await previewSkillReplacement(g.request, g.options);
  g.pins.push({
    schema: "fixture-schema",
    schemaRoot: g.schemaRoot,
    profiles: ["codex"],
    skillHosts: [],
    skillBundle: "default",
  });
  await expect(
    applySkillReplacement(nextPreview, nextPreview.token, g.options),
  ).rejects.toMatchObject({ code: "SKILL_REQUIRED_BY_PIN" });
  expect(
    await readFile(path.join(g.projectRoot, g.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");

  const h = await fixture();
  const occupied = await previewSkillReplacement(h.request, h.options);
  await applySkillReplacement(occupied, occupied.token, h.options);
  await writeFile(
    path.join(h.schemaRoot, "skills.txt"),
    "sample-skill\nother-skill\n",
  );
  await mkdir(path.join(h.root, "source/.agents/skills/other-skill"), {
    recursive: true,
  });
  await writeFile(
    path.join(h.root, "source/.agents/skills/other-skill/SKILL.md"),
    "# Other skill\n",
  );
  await mkdir(path.join(h.projectRoot, ".agents/skills/other-skill"), {
    recursive: true,
  });
  await writeFile(
    path.join(h.projectRoot, ".agents/skills/other-skill/SKILL.md"),
    "# Local other skill\n",
  );
  await expect(
    previewSkillReplacement(
      { ...h.request, target: ".agents/skills/other-skill" },
      h.options,
    ),
  ).rejects.toMatchObject({
    code: "RESOURCE_BACKUP_ID_OCCUPIED",
  });
});

test("replacement apply refuses changed active selection bytes without mutation", async () => {
  const f = await fixture();
  const selectionPath = path.join(f.projectRoot, "active-selection.json");
  await writeFile(selectionPath, "[]\n");
  const receiptPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements",
    f.request.backupId,
    "receipt.json",
  );
  let armed = false;
  let changed = false;
  const options: ResourceRuntimeOptions = {
    ...f.options,
    resolveActivePins: async () => {
      if (armed && !changed) {
        try {
          const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
            phase?: string;
          };
          if (receipt.phase === "target-moving-original") {
            await writeFile(
              selectionPath,
              `${JSON.stringify([
                {
                  schema: "fixture-schema",
                  schemaRoot: f.schemaRoot,
                  profiles: ["codex"],
                  skillHosts: [],
                  skillBundle: "default",
                },
              ])}\n`,
            );
            changed = true;
          }
        } catch {
          // The receipt does not exist during preview and initial revalidation.
        }
      }
      return JSON.parse(
        await readFile(selectionPath, "utf8"),
      ) as ActiveSkillPin[];
    },
  };
  const preview = await previewSkillReplacement(f.request, options);
  armed = true;

  await expect(
    applySkillReplacement(preview, preview.token, options),
  ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });
  expect(changed).toBe(true);
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  await expect(
    readFile(
      path.join(f.projectRoot, ".openspec/opsx-schema/managed-resources.json"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("replacement refuses overlapping incomplete switch journal", async () => {
  const f = await fixture();
  await writeIncompleteSwitchJournal(f);

  await expect(
    previewSkillReplacement(f.request, f.options),
  ).rejects.toMatchObject({ code: "SWITCH_RECOVERY_REQUIRED" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  await expect(
    readFile(
      path.join(f.projectRoot, ".openspec/opsx-schema/managed-resources.json"),
      "utf8",
    ),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("replacement recovers an empty receipt-less reservation after a crash", async () => {
  const f = await fixture();
  const reservation = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements",
    f.request.backupId,
  );
  await mkdir(reservation, { recursive: true });
  const orphan = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements/unowned-reservation",
  );
  await mkdir(orphan, { recursive: true });
  await writeFile(path.join(orphan, "operator-notes.txt"), "keep me\n");

  const preview = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    preview,
    preview.token,
    f.options,
  );
  expect(applied.phase).toBe("complete");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
  expect(await readFile(applied.receiptPath, "utf8")).toContain(
    '"phase": "complete"',
  );
  expect((await readdir(reservation)).sort()).toEqual([
    "backup",
    "receipt.json",
  ]);
  expect(await readFile(path.join(orphan, "operator-notes.txt"), "utf8")).toBe(
    "keep me\n",
  );
});

test("unowned receipt-less reservation does not strand future replacements", async () => {
  const f = await fixture();
  const orphan = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements/crashed-backup",
  );
  await mkdir(orphan, { recursive: true });
  await writeFile(path.join(orphan, "operator-notes.txt"), "keep me\n");

  const request = { ...f.request, backupId: "next-backup" };
  const preview = await previewSkillReplacement(request, f.options);
  const applied = await applySkillReplacement(
    preview,
    preview.token,
    f.options,
  );
  expect(applied.phase).toBe("complete");
  expect(await readFile(path.join(orphan, "operator-notes.txt"), "utf8")).toBe(
    "keep me\n",
  );
});

test("restore refuses external target edits and preserves the changed tree", async () => {
  const f = await fixture();
  const preview = await previewSkillReplacement(f.request, f.options);
  await applySkillReplacement(preview, preview.token, f.options);
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "custom managed edit\n",
  );
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RESTORE_TARGET_CHANGED" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("custom managed edit\n");
});

test("restore recovers original moved before replacement stage installation", async () => {
  for (const phase of [
    "target-moving-original",
    "target-original-moved",
  ] as const) {
    const f = await fixture();
    const { applied, stage } = await simulateOriginalMoveCrash(f, phase);
    const target = path.join(f.projectRoot, f.target);
    const restore = await previewSkillRestore(
      f.projectRoot,
      f.request.backupId,
      f.options,
    );

    expect(restore.canApply).toBe(true);
    const restored = await applySkillRestore(restore, restore.token, f.options);
    expect(restored.receipt.restore?.phase).toBe("complete");
    expect(await readFile(path.join(target, "SKILL.md"), "utf8")).toBe(
      "# Local skill\nkeep this backup\n",
    );
    expect(restored.observed.rollbackKind).toBe("missing");
    expect(restored.observed.stageKind).toBe("missing");
    await expect(stat(stage)).rejects.toMatchObject({ code: "ENOENT" });
    expect(restored.observed.backupDigest).toBe(applied.receipt.beforeDigest);
  }
});

test("restore refuses a tampered replacement rollback tree", async () => {
  const f = await fixture();
  const { applied, rollback } = await simulateOriginalMoveCrash(
    f,
    "target-original-moved",
  );
  const tamperedPlan = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  await utimes(rollback, new Date(1), new Date(1));
  await expect(
    applySkillRestore(tamperedPlan, tamperedPlan.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_STALE" });
  const rollbackPlan = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  await writeFile(path.join(rollback, "SKILL.md"), "tampered original\n");

  await expect(
    applySkillRestore(rollbackPlan, rollbackPlan.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RESTORE_ROLLBACK_CHANGED" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RESTORE_ROLLBACK_CHANGED" });
  expect(await readFile(path.join(rollback, "SKILL.md"), "utf8")).toBe(
    "tampered original\n",
  );
  await expect(stat(path.join(f.projectRoot, f.target))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});

test("restore refuses original-move recovery when target is actively pinned", async () => {
  const f = await fixture();
  const { applied, rollback } = await simulateOriginalMoveCrash(
    f,
    "target-original-moved",
  );
  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  f.pins.push({
    schema: "fixture-schema",
    schemaRoot: f.schemaRoot,
    profiles: ["codex"],
    skillHosts: [],
    skillBundle: "default",
  });

  await expect(
    applySkillRestore(restore, restore.token, f.options),
  ).rejects.toMatchObject({ code: "SKILL_REQUIRED_BY_PIN" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "SKILL_REQUIRED_BY_PIN" });
  await expect(stat(path.join(f.projectRoot, f.target))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readFile(path.join(rollback, "SKILL.md"), "utf8")).toBe(
    "# Local skill\nkeep this backup\n",
  );
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});

test("replacement preview shows all remaining bundle collisions without claiming full installation", async () => {
  const f = await fixture();
  const names = ["sample-skill", "another", "third", "fourth", "fifth"];
  await writeFile(
    path.join(f.schemaRoot, "skills.txt"),
    `${names.join("\n")}\n`,
  );
  for (const name of names.slice(1)) {
    const source = path.join(f.root, "source", ".agents/skills", name);
    const custom = path.join(f.projectRoot, ".agents/skills", name);
    await mkdir(source, { recursive: true });
    await mkdir(custom, { recursive: true });
    await writeFile(path.join(source, "SKILL.md"), `# ${name}\n`);
    await writeFile(path.join(custom, "SKILL.md"), `# Custom ${name}\n`);
  }
  const plan = await previewSkillReplacement(f.request, f.options);
  expect(
    plan.remainingUnmanagedCollisions.map((collision) => collision.target),
  ).toEqual([
    ".agents/skills/another",
    ".agents/skills/fifth",
    ".agents/skills/fourth",
    ".agents/skills/third",
  ]);
});

test("restore refuses a newly required alias and keeps target and backup", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  await applySkillReplacement(replacement, replacement.token, f.options);
  f.pins.push({
    schema: "fixture-schema",
    schemaRoot: f.schemaRoot,
    profiles: ["codex"],
    skillHosts: [],
    skillBundle: "default",
  });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "SKILL_REQUIRED_BY_PIN" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
});

test("restore refuses overlapping incomplete switch journal", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  await applySkillReplacement(replacement, replacement.token, f.options);
  const ownershipPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/managed-resources.json",
  );
  const beforeOwnership = await readFile(ownershipPath, "utf8");
  await writeIncompleteSwitchJournal(f);

  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "SWITCH_RECOVERY_REQUIRED" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
  expect(await readFile(ownershipPath, "utf8")).toBe(beforeOwnership);
});

test("restore pin guard derives aliases instead of trusting tampered receipt aliases", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const receipt = JSON.parse(
    await readFile(applied.receiptPath, "utf8"),
  ) as Record<string, unknown>;
  receipt.aliases = [];
  await writeFile(applied.receiptPath, `${JSON.stringify(receipt)}\n`);
  f.pins.push({
    schema: "fixture-schema",
    schemaRoot: f.schemaRoot,
    profiles: ["codex"],
    skillHosts: [],
    skillBundle: "default",
  });

  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "SKILL_REQUIRED_BY_PIN" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});

test("restore refuses a missing backup without overwriting user content", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  const backup = path.join(
    f.projectRoot,
    ...applied.receipt.backupPath.split("/"),
  );
  await rm(backup, { recursive: true });
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "user content after preview\n",
  );

  await expect(
    applySkillRestore(restore, restore.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_BACKUP_MISSING" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_BACKUP_MISSING" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("user content after preview\n");
  expect(await readFile(applied.receiptPath, "utf8")).toContain(
    '"phase": "complete"',
  );
});

test("restore refuses a corrupt backup and retains it and user content", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  const backupSkill = path.join(
    f.projectRoot,
    ...applied.receipt.backupPath.split("/"),
    "SKILL.md",
  );
  await writeFile(backupSkill, "corrupt backup content\n");
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "user content after preview\n",
  );

  await expect(
    applySkillRestore(restore, restore.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_BACKUP_CORRUPT" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_BACKUP_CORRUPT" });
  expect(await readFile(backupSkill, "utf8")).toBe("corrupt backup content\n");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("user content after preview\n");
});

test("restore refuses changed ownership without overwriting user content", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  const ownershipPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/managed-resources.json",
  );
  const originalOwnership = JSON.parse(
    await readFile(ownershipPath, "utf8"),
  ) as { resources: Record<string, { digest: string }> };
  originalOwnership.resources[f.target]!.digest = "0".repeat(64);
  const changedOwnership = `${JSON.stringify(originalOwnership, null, 2)}\n`;
  await writeFile(ownershipPath, changedOwnership);
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "user content after preview\n",
  );

  await expect(
    applySkillRestore(restore, restore.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RESTORE_OWNERSHIP_CHANGED" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RESTORE_OWNERSHIP_CHANGED" });
  expect(await readFile(ownershipPath, "utf8")).toBe(changedOwnership);
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("user content after preview\n");
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});

test("restore refuses a malformed receipt without overwriting user content", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  await writeFile(applied.receiptPath, '{"schemaVersion":\n');
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "user content after preview\n",
  );

  await expect(
    applySkillRestore(restore, restore.token, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RECEIPT_CORRUPT" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RECEIPT_CORRUPT" });
  expect(await readFile(applied.receiptPath, "utf8")).toBe(
    '{"schemaVersion":\n',
  );
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("user content after preview\n");
});

test("inspection and restore refuse malformed receipt error metadata", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const raw = await readFile(applied.receiptPath, "utf8");
  const receipt = JSON.parse(raw) as Record<string, unknown>;
  receipt.restore = {
    phase: "partial",
    stagePath: ".agents/skills/.opsx-restore-sample-backup-test.stage",
    rollbackPath:
      ".agents/skills/.opsx-restore-rollback-sample-backup-test.current",
    error: { untrusted: "object" },
  };
  await writeFile(applied.receiptPath, `${JSON.stringify(receipt)}\n`);

  await expect(
    inspectSkillReplacement(f.projectRoot, f.request.backupId),
  ).rejects.toMatchObject({ code: "RESOURCE_RECEIPT_CORRUPT" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RECEIPT_CORRUPT" });
  delete receipt.restore;
  receipt.error = { untrusted: "object" };
  await writeFile(applied.receiptPath, `${JSON.stringify(receipt)}\n`);
  await expect(
    inspectSkillReplacement(f.projectRoot, f.request.backupId),
  ).rejects.toMatchObject({ code: "RESOURCE_RECEIPT_CORRUPT" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, f.options),
  ).rejects.toMatchObject({ code: "RESOURCE_RECEIPT_CORRUPT" });
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
});

test("restore refuses incomplete active-pin knowledge without overwriting user content", async () => {
  const f = await fixture();
  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  const incompleteOptions: ResourceRuntimeOptions = {
    ...f.options,
    resolveActivePins: async () => {
      throw new Error("active pins unavailable");
    },
  };
  await writeFile(
    path.join(f.projectRoot, f.target, "SKILL.md"),
    "user content after preview\n",
  );

  await expect(
    applySkillRestore(restore, restore.token, incompleteOptions),
  ).rejects.toMatchObject({ code: "SKILL_REQUIREMENTS_INCOMPLETE" });
  await expect(
    previewSkillRestore(f.projectRoot, f.request.backupId, incompleteOptions),
  ).rejects.toMatchObject({ code: "SKILL_REQUIREMENTS_INCOMPLETE" });
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("user content after preview\n");
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});

test("inspect and safely restore a partial replacement after pin knowledge returns", async () => {
  const f = await fixture();
  const targetSkill = path.join(f.projectRoot, f.target, "SKILL.md");
  const interruptedOptions: ResourceRuntimeOptions = {
    ...f.options,
    resolveActivePins: async () => {
      if (
        (await readFile(targetSkill, "utf8")) ===
        "# Declared skill\nnew content\n"
      )
        throw new Error("active pins unavailable during swap");
      return [];
    },
  };
  const replacement = await previewSkillReplacement(
    f.request,
    interruptedOptions,
  );
  await expect(
    applySkillReplacement(replacement, replacement.token, interruptedOptions),
  ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });

  const partial = await inspectSkillReplacement(
    f.projectRoot,
    f.request.backupId,
  );
  expect(partial.phase).toBe("partial");
  expect(partial.observed.backupKind).toBe("directory");
  expect(partial.observed.backupDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.targetDigest).toBe(partial.receipt.sourceDigest);
  expect(partial.observed.ownershipMatchesBefore).toBe(true);
  expect(partial.observed.ownershipMatchesAfter).toBe(false);

  const restore = await previewSkillRestore(
    f.projectRoot,
    f.request.backupId,
    f.options,
  );
  expect(restore.canApply).toBe(true);
  const restored = await applySkillRestore(restore, restore.token, f.options);
  expect(restored.receipt.restore?.phase).toBe("complete");
  expect(await readFile(targetSkill, "utf8")).toBe(
    "# Local skill\nkeep this backup\n",
  );
  expect(restored.observed.backupDigest).toBe(partial.receipt.beforeDigest);
});

test("replacement backup-copy failure keeps original target and reports no verified backup", async () => {
  const f = await fixture();
  const unrelated = await addUnrelatedTarget(f);
  const receiptPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements",
    f.request.backupId,
    "receipt.json",
  );
  const backupPath = path.join(path.dirname(receiptPath), "backup");
  const sourceRoot = f.options.sourceRoots!["intent-driven-dev/skills"]!;
  let armed = false;
  let triggered = false;
  const sourceRoots = Object.defineProperty({}, "intent-driven-dev/skills", {
    enumerable: true,
    get: () => {
      if (armed && !triggered) {
        try {
          const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
            phase?: string;
          };
          if (receipt.phase === "intent") {
            mkdirSync(backupPath);
            triggered = true;
          }
        } catch {
          // Plan revalidation happens before the transaction receipt exists.
        }
      }
      return sourceRoot;
    },
  }) as ResourceRuntimeOptions["sourceRoots"];
  const options: ResourceRuntimeOptions = { ...f.options, sourceRoots };
  const preview = await previewSkillReplacement(f.request, options);
  armed = true;

  await expect(
    applySkillReplacement(preview, preview.token, options),
  ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });
  expect(triggered).toBe(true);
  const partial = await inspectSkillReplacement(
    f.projectRoot,
    f.request.backupId,
  );
  expect(partial.phase).toBe("partial");
  expect(partial.receipt.backupDigest).toBeNull();
  expect(partial.observed.targetDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.backupDigest).not.toBe(partial.receipt.beforeDigest);
  expect(partial.observed.ownershipMatchesBefore).toBe(true);
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(await readFile(unrelated, "utf8")).toBe(
    "unrelated target must stay unchanged\n",
  );
});

test("replacement stage-copy failure keeps original target and verified backup", async () => {
  const f = await fixture();
  const unrelated = await addUnrelatedTarget(f);
  const fault = injectPhaseFault(f, "backup-copying", (receipt) => {
    const stage = path.join(
      f.projectRoot,
      ...String(receipt.stagePath).split("/"),
    );
    return mkdir(stage);
  });
  const preview = await previewSkillReplacement(f.request, fault.options);
  fault.arm();

  await expect(
    applySkillReplacement(preview, preview.token, fault.options),
  ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });
  expect(fault.triggered()).toBe(true);
  const partial = await inspectSkillReplacement(
    f.projectRoot,
    f.request.backupId,
  );
  expect(partial.phase).toBe("partial");
  expect(partial.observed.targetDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.backupDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.stageKind).toBe("directory");
  expect(partial.observed.rollbackKind).toBe("missing");
  expect(partial.observed.ownershipMatchesBefore).toBe(true);
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(await readFile(unrelated, "utf8")).toBe(
    "unrelated target must stay unchanged\n",
  );
});

test("replacement swap failure restores original target from transaction rollback", async () => {
  const f = await fixture();
  const unrelated = await addUnrelatedTarget(f);
  const fault = injectPhaseFault(
    f,
    "target-moving-original",
    async (receipt) => {
      await rm(
        path.join(f.projectRoot, ...String(receipt.stagePath).split("/")),
        { recursive: true },
      );
    },
    3,
  );
  const preview = await previewSkillReplacement(f.request, fault.options);
  fault.arm();

  await expect(
    applySkillReplacement(preview, preview.token, fault.options),
  ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });
  expect(fault.triggered()).toBe(true);
  const partial = await inspectSkillReplacement(
    f.projectRoot,
    f.request.backupId,
  );
  expect(partial.phase).toBe("partial");
  expect(partial.observed.targetDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.backupDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.rollbackKind).toBe("missing");
  expect(partial.observed.stageKind).toBe("missing");
  expect(partial.observed.ownershipMatchesBefore).toBe(true);
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(await readFile(unrelated, "utf8")).toBe(
    "unrelated target must stay unchanged\n",
  );
});

test("ownership write failure leaves truthful partial inspection and unrelated target intact", async () => {
  const f = await fixture();
  const unrelated = await addUnrelatedTarget(f);
  const ownershipPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/managed-resources.json",
  );
  const ownershipDirectory = path.dirname(ownershipPath);
  const fault = injectPhaseFault(
    f,
    "ownership-updating",
    async (_receipt, matchingCall) => {
      await chmod(ownershipDirectory, matchingCall === 2 ? 0o555 : 0o700);
    },
    [2, 3],
  );
  const preview = await previewSkillReplacement(f.request, fault.options);
  fault.arm();

  try {
    await expect(
      applySkillReplacement(preview, preview.token, fault.options),
    ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });
  } finally {
    await chmod(ownershipDirectory, 0o700);
  }
  expect(fault.triggered()).toBe(true);
  const partial = await inspectSkillReplacement(
    f.projectRoot,
    f.request.backupId,
  );
  expect(partial.phase).toBe("partial");
  expect(partial.observed.targetDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.backupDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.ownershipMatchesBefore).toBe(true);
  expect(partial.observed.ownershipMatchesAfter).toBe(false);
  await expect(readFile(ownershipPath, "utf8")).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await readFile(unrelated, "utf8")).toBe(
    "unrelated target must stay unchanged\n",
  );
});

test("durable receipt write failure refuses false success and keeps inspectable evidence", async () => {
  const f = await fixture();
  const unrelated = await addUnrelatedTarget(f);
  const receiptPath = path.join(
    f.projectRoot,
    ".openspec/opsx-schema/replacements",
    f.request.backupId,
    "receipt.json",
  );
  const receiptDirectory = path.dirname(receiptPath);
  const fault = injectPhaseFault(f, "backup-copying", async () => {
    await chmod(receiptDirectory, 0o500);
  });
  const preview = await previewSkillReplacement(f.request, fault.options);
  fault.arm();

  try {
    await expect(
      applySkillReplacement(preview, preview.token, fault.options),
    ).rejects.toMatchObject({ code: "RESOURCE_PARTIAL" });
  } finally {
    await chmod(receiptDirectory, 0o700);
  }
  expect(fault.triggered()).toBe(true);
  const partial = await inspectSkillReplacement(
    f.projectRoot,
    f.request.backupId,
  );
  expect(partial.phase).toBe("backup-copying");
  expect(partial.observed.targetDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.backupDigest).toBe(partial.receipt.beforeDigest);
  expect(partial.observed.ownershipMatchesBefore).toBe(true);
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Local skill\nkeep this backup\n");
  expect(await readFile(unrelated, "utf8")).toBe(
    "unrelated target must stay unchanged\n",
  );
});

test("replacement copies source across filesystem devices", async () => {
  const projectRoot = await mkdtemp("/dev/shm/opsx-replacement-project-");
  created.push(projectRoot);
  const f = await fixture(projectRoot);
  expect((await stat(f.root)).dev).not.toBe((await stat(f.projectRoot)).dev);

  const replacement = await previewSkillReplacement(f.request, f.options);
  const applied = await applySkillReplacement(
    replacement,
    replacement.token,
    f.options,
  );
  expect(applied.phase).toBe("complete");
  expect(
    await readFile(path.join(f.projectRoot, f.target, "SKILL.md"), "utf8"),
  ).toBe("# Declared skill\nnew content\n");
  expect(
    await readFile(
      path.join(
        f.projectRoot,
        ...applied.receipt.backupPath.split("/"),
        "SKILL.md",
      ),
      "utf8",
    ),
  ).toBe("# Local skill\nkeep this backup\n");
});
