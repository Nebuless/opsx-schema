import { afterEach, expect, test } from "bun:test";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../src/domain/cli.ts", import.meta.url));
const roots: string[] = [];
const legacySchema = "empty-legacy";
const changeName = "legacy-history";
const schemaName = "compound-intent-driven";
const openSpecSkills = [
  "openspec-explore",
  "openspec-propose",
  "openspec-apply-change",
  "openspec-sync-specs",
  "openspec-archive-change",
];
const compoundSkills = [
  "ce-brainstorm",
  "ce-plan",
  "ce-work",
  "ce-simplify-code",
  "ce-code-review",
  "ce-compound",
  "openspec-explore",
  "openspec-propose",
  "openspec-apply-change",
  "openspec-sync-specs",
  "openspec-archive-change",
];
type CliResult = { code: number; stdout: string; stderr: string };

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function invoke(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): CliResult {
  const result = Bun.spawnSync({
    cmd: [process.execPath, cli, ...args],
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

function envelope<T>(result: CliResult, expectedCommand: string) {
  expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(0);
  expect(result.stderr, result.stdout).toBe("");
  const output = JSON.parse(result.stdout) as {
    schemaVersion: number;
    command: string;
    ok: boolean;
    data: T;
  };
  expect(output.schemaVersion).toBe(1);
  expect(output.command).toBe(expectedCommand);
  expect(output.ok).toBe(true);
  return output;
}

async function createFixture(
  options: { collisionCount?: number; includeLegacyChange?: boolean } = {},
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "opsx-issue5-cli-"));
  roots.push(root);
  const bin = path.join(root, "bin");
  const emptySchema = path.join(root, "openspec", "schemas", legacySchema);
  const sources = {
    everyinc: path.join(root, "source-everyinc"),
    openspec: path.join(root, "source-openspec"),
  };
  await Promise.all([
    mkdir(bin, { recursive: true }),
    mkdir(emptySchema, { recursive: true }),
    mkdir(path.join(sources.everyinc, "skills"), { recursive: true }),
    mkdir(path.join(sources.openspec, "skills"), { recursive: true }),
  ]);
  if (options.includeLegacyChange !== false)
    await mkdir(path.join(root, "openspec", "changes", changeName), {
      recursive: true,
    });
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    `schema: ${legacySchema}\n`,
  );
  if (options.includeLegacyChange !== false)
    await writeFile(
      path.join(root, "openspec", "changes", changeName, ".openspec.yaml"),
      `schema: ${legacySchema}\n`,
    );
  await writeFile(
    path.join(emptySchema, "schema.yaml"),
    `name: ${legacySchema}\nversion: 1\ndescription: Empty legacy pin fixture\nartifacts: []\n`,
  );
  await writeFile(path.join(emptySchema, "skills.txt"), "");

  for (const [repository, names] of [
    ["everyinc", compoundSkills.slice(0, 6)],
    ["openspec", compoundSkills.slice(6)],
  ] as const) {
    for (const name of names) {
      const skill = path.join(sources[repository], "skills", name);
      await mkdir(skill, { recursive: true });
      await writeFile(
        path.join(skill, "SKILL.md"),
        `---\nname: ${name}\ndescription: Packaged ${name} source for offline CLI verification.\n---\n\n# Packaged ${name}\nsource ${repository}\n`,
      );
      await writeFile(
        path.join(skill, "source.txt"),
        `${repository}:${name}\n`,
      );
    }
  }
  for (const name of openSpecSkills.slice(0, options.collisionCount ?? 5)) {
    const target = path.join(root, ".omp", "skills", name);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), `# Local ${name}\n`);
    await writeFile(path.join(target, "notes.txt"), `keep-${name}\n`);
  }

  const openSpec = path.join(bin, "openspec");
  await writeFile(
    openSpec,
    `#!/bin/sh
if [ "$1" = "--version" ]; then echo 1.13.2; exit 0; fi
if [ "$1" = "schema" ] && [ "$2" = "which" ]; then
  name="$3"
  if [ "$name" = "${schemaName}" ]; then dir="$TEST_PROJECT_ROOT/openspec/schemas/${schemaName}";
  elif [ "$name" = "${legacySchema}" ]; then dir="$TEST_PROJECT_ROOT/openspec/schemas/${legacySchema}";
  else echo "unknown schema: $name" >&2; exit 1; fi
  printf '{"name":"%s","path":"%s","shadows":[]}\\n' "$name" "$dir"
  exit 0
fi
if [ "$1" = "schema" ] && [ "$2" = "validate" ]; then echo '{"valid":true}'; exit 0; fi
if [ "$1" = "schemas" ]; then printf '[{"name":"${legacySchema}","source":"project"},{"name":"${schemaName}","source":"project"}]\\n'; exit 0; fi
if [ "$1" = "list" ]; then
  if [ "$TEST_CHANGE_ENABLED" = "1" ]; then printf '{"changes":[{"name":"${changeName}","status":"in-progress"}]}\\n';
  else printf '{"changes":[]}\\n'; fi
  exit 0
fi
if [ "$1" = "status" ]; then printf '{"changeName":"${changeName}","schemaName":"${legacySchema}","artifacts":[]}\\n'; exit 0; fi
if [ "$1" = "instructions" ]; then printf '{"state":"ready","progress":{"total":0,"complete":0,"remaining":0}}\\n'; exit 0; fi
echo "unexpected OpenSpec command: $*" >&2
exit 99
`,
  );
  await chmod(openSpec, 0o755);

  const git = path.join(bin, "git");
  await writeFile(
    git,
    `#!/bin/sh
if [ "$1" != "clone" ]; then echo "unexpected git command: $*" >&2; exit 99; fi
case "$6" in
  *EveryInc*) source="${sources.everyinc}" ;;
  *Fission-AI*) source="${sources.openspec}" ;;
  *) echo "unexpected source URL: $6" >&2; exit 98 ;;
esac
mkdir -p "$7"
cp -R "$source/skills" "$7/skills"
`,
  );
  await chmod(git, 0o755);

  return {
    root,
    sources,
    env: {
      ...process.env,
      TEST_PROJECT_ROOT: root,
      TEST_CHANGE_ENABLED: options.includeLegacyChange === false ? "0" : "1",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  };
}

test(
  "issue 5 replaces five OMP collisions offline, then switches and verifies all 11 managed skills",
  async () => {
    const restoreFixture = await createFixture({
      collisionCount: 1,
      includeLegacyChange: false,
    });
    const restoreId = "issue5-restore-probe";
    const restoreTarget = `.omp/skills/${openSpecSkills[0]}`;
    const restoreSchemaArgs = [
      "--project",
      restoreFixture.root,
      "schemas",
      "install",
      schemaName,
    ];
    const restoreSchemaPreview = envelope<{
      confirmation: { token: string };
    }>(
      invoke(
        [...restoreSchemaArgs, "--json"],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "schemas install",
    );
    envelope(
      invoke(
        [
          ...restoreSchemaArgs,
          "--apply-token",
          restoreSchemaPreview.data.confirmation.token,
          "--json",
        ],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "schemas install",
    );
    const restoreOriginalSkill = {
      instructions: `# Local ${openSpecSkills[0]}\n`,
      notes: `keep-${openSpecSkills[0]}\n`,
    };
    const restoreReplaceArgs = [
      "--project",
      restoreFixture.root,
      "skills",
      "replace",
      restoreTarget,
      "--schema",
      schemaName,
      "--bundle",
      "default",
      "--backup-id",
      restoreId,
    ];
    const restoreReplacePreview = envelope<{
      confirmation: { token: string };
    }>(
      invoke(
        [...restoreReplaceArgs, "--json"],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "skills replace",
    );
    envelope(
      invoke(
        [
          ...restoreReplaceArgs,
          "--apply-token",
          restoreReplacePreview.data.confirmation.token,
          "--json",
        ],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "skills replace",
    );
    const restorePreview = envelope<{
      phase: string;
      confirmation: { token: string };
    }>(
      invoke(
        [
          "--project",
          restoreFixture.root,
          "skills",
          "restore",
          restoreId,
          "--json",
        ],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "skills restore",
    );
    expect(restorePreview.data.phase).toBe("preview");
    envelope(
      invoke(
        [
          "--project",
          restoreFixture.root,
          "skills",
          "restore",
          restoreId,
          "--apply-token",
          restorePreview.data.confirmation.token,
          "--json",
        ],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "skills restore",
    );
    expect(
      await readFile(
        path.join(restoreFixture.root, restoreTarget, "SKILL.md"),
        "utf8",
      ),
    ).toBe(restoreOriginalSkill.instructions);
    expect(
      await readFile(
        path.join(restoreFixture.root, restoreTarget, "notes.txt"),
        "utf8",
      ),
    ).toBe(restoreOriginalSkill.notes);
    expect(
      await readFile(
        path.join(restoreFixture.root, "openspec", "config.yaml"),
        "utf8",
      ),
    ).toBe(`schema: ${legacySchema}\n`);
    const restoreInspection = envelope<{
      receipt: { backupPath: string; restore?: { phase: string } };
      observed: { backupKind: string; backupDigest: string };
    }>(
      invoke(
        [
          "--project",
          restoreFixture.root,
          "skills",
          "replace",
          "inspect",
          restoreId,
          "--json",
        ],
        restoreFixture.root,
        restoreFixture.env,
      ),
      "skills replace",
    );
    expect(restoreInspection.data.receipt.restore?.phase).toBe("complete");
    expect(restoreInspection.data.observed.backupKind).toBe("directory");
    expect(restoreInspection.data.observed.backupDigest).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(
      await readFile(
        path.join(
          restoreFixture.root,
          restoreInspection.data.receipt.backupPath,
          "notes.txt",
        ),
        "utf8",
      ),
    ).toBe(restoreOriginalSkill.notes);

    const { root, sources, env } = await createFixture();
    const initialConfig = await readFile(
      path.join(root, "openspec", "config.yaml"),
      "utf8",
    );
    const legacyPin = path.join(
      root,
      "openspec",
      "changes",
      changeName,
      ".openspec.yaml",
    );
    const originalPin = await readFile(legacyPin);
    const originalHistory = await readFile(
      path.join(
        root,
        "openspec",
        "changes",
        changeName,
        ".opsx-provenance.json",
      ),
    ).catch(() => null);
    expect(originalHistory).toBeNull();
    const targetNamesMissingFromOMP = compoundSkills.filter(
      (name) => !openSpecSkills.includes(name),
    );
    expect(targetNamesMissingFromOMP).toHaveLength(6);
    for (const name of targetNamesMissingFromOMP)
      await expect(
        access(path.join(root, ".omp", "skills", name)),
      ).rejects.toThrow();
    const initialStatus = envelope<{
      changes: Array<{ name: string; history: { created: string } }>;
    }>(invoke(["--project", root, "status", "--json"], root, env), "status");
    expect(initialStatus.data.changes).toContainEqual(
      expect.objectContaining({
        name: changeName,
        history: expect.objectContaining({ created: "Unknown" }),
      }),
    );

    const schemaArgs = ["--project", root, "schemas", "install", schemaName];
    const schemaPreview = envelope<{
      phase: string;
      confirmation: { token: string };
    }>(invoke([...schemaArgs, "--json"], root, env), "schemas install");
    expect(schemaPreview.data.phase).toBe("preview");
    await expect(
      access(path.join(root, "openspec", "schemas", schemaName)),
    ).rejects.toThrow();
    envelope(
      invoke(
        [
          ...schemaArgs,
          "--apply-token",
          schemaPreview.data.confirmation.token,
          "--json",
        ],
        root,
        env,
      ),
      "schemas install",
    );
    expect(
      await Bun.file(
        path.join(root, "openspec", "schemas", schemaName, "skills.txt"),
      ).text(),
    ).toContain("Fission-AI/OpenSpec");
    const skillInspection = envelope<{
      bundles: Array<{
        name: string;
        available: boolean;
        declarations: unknown[];
      }>;
    }>(
      invoke(
        ["--project", root, "skills", "inspect", schemaName, "--json"],
        root,
        env,
      ),
      "skills inspect",
    );
    expect(skillInspection.data.bundles[0]).toMatchObject({
      name: "default",
      available: true,
    });
    expect(skillInspection.data.bundles[0]?.declarations).toHaveLength(11);

    const replacementIds = openSpecSkills.map(
      (_, index) => `issue5-replace-${index + 1}`,
    );
    const inspectedIds = replacementIds;
    for (let index = 0; index < openSpecSkills.length; index++) {
      const skill = openSpecSkills[index]!;
      const target = `.omp/skills/${skill}`;
      const backupId = replacementIds[index]!;
      const originalSkill = {
        instructions: `# Local ${skill}\n`,
        notes: `keep-${skill}\n`,
      };
      const replaceArgs = [
        "--project",
        root,
        "skills",
        "replace",
        target,
        "--schema",
        schemaName,
        "--bundle",
        "default",
        "--backup-id",
        backupId,
      ];
      const preview = envelope<{
        phase: string;
        plan: {
          canApply: boolean;
          inventory: Array<{ path: string }>;
          remainingUnmanagedCollisions: unknown[];
        };
        confirmation: { token: string };
      }>(invoke([...replaceArgs, "--json"], root, env), "skills replace");
      expect(preview.data.phase).toBe("preview");
      expect(preview.data.plan.canApply).toBe(true);
      expect(preview.data.plan.remainingUnmanagedCollisions).toHaveLength(
        openSpecSkills.length - index - 1,
      );
      expect(preview.data.plan.inventory.map((item) => item.path)).toEqual(
        expect.arrayContaining(["SKILL.md", "source.txt", "notes.txt"]),
      );
      expect(preview.data.plan.inventory).toHaveLength(3);
      expect(await readFile(path.join(root, target, "SKILL.md"), "utf8")).toBe(
        originalSkill.instructions,
      );
      expect(
        await readFile(path.join(root, "openspec", "config.yaml"), "utf8"),
      ).toBe(initialConfig);
      const defaultAfterReplacement = envelope<{ defaultSchema: string }>(
        invoke(["--project", root, "status", "--json"], root, env),
        "status",
      );
      expect(defaultAfterReplacement.data.defaultSchema).toBe(legacySchema);

      const applied = envelope<{ phase: string }>(
        invoke(
          [
            ...replaceArgs,
            "--apply-token",
            preview.data.confirmation.token,
            "--json",
          ],
          root,
          env,
        ),
        "skills replace",
      );
      expect(applied.data.phase).toBe("applied");
      const selectedSource = skill.startsWith("openspec-")
        ? sources.openspec
        : sources.everyinc;
      expect(await readFile(path.join(root, target, "SKILL.md"), "utf8")).toBe(
        await readFile(
          path.join(selectedSource, "skills", skill, "SKILL.md"),
          "utf8",
        ),
      );
      expect(
        await Bun.file(path.join(root, target, "notes.txt")).exists(),
      ).toBe(false);
      expect(
        await readFile(path.join(root, "openspec", "config.yaml"), "utf8"),
      ).toBe(initialConfig);
      const defaultAfterApply = envelope<{ defaultSchema: string }>(
        invoke(["--project", root, "status", "--json"], root, env),
        "status",
      );
      expect(defaultAfterApply.data.defaultSchema).toBe(legacySchema);
    }

    const switchArgs = [
      "--project",
      root,
      "schema",
      "switch",
      schemaName,
      "--skill-host",
      "omp",
      "--bundle",
      "default",
    ];
    const switchPreview = envelope<{
      phase: string;
      plan: {
        canApply: boolean;
        skillHosts: Array<{
          host: string;
          targets: Array<{ skill: string; action: string }>;
        }>;
      };
      confirmation: { token: string };
    }>(invoke([...switchArgs, "--json"], root, env), "schema switch");
    expect(switchPreview.data.phase).toBe("preview");
    expect(switchPreview.data.plan.canApply).toBe(true);
    const ompPlan = switchPreview.data.plan.skillHosts.find(
      (host) => host.host === "omp",
    );
    expect(ompPlan?.targets.map((target) => target.skill).sort()).toEqual(
      [...compoundSkills].sort(),
    );
    expect(ompPlan?.targets.every((target) => target.action !== "refuse")).toBe(
      true,
    );
    expect(
      await readFile(path.join(root, "openspec", "config.yaml"), "utf8"),
    ).toBe(initialConfig);
    envelope(
      invoke(
        [
          ...switchArgs,
          "--apply-token",
          switchPreview.data.confirmation.token,
          "--json",
        ],
        root,
        env,
      ),
      "schema switch",
    );

    for (const skill of compoundSkills) {
      const sourceRoot = skill.startsWith("openspec-")
        ? sources.openspec
        : sources.everyinc;
      const destination = path.join(root, ".omp", "skills", skill);
      expect(await readFile(path.join(destination, "SKILL.md"), "utf8")).toBe(
        await readFile(
          path.join(sourceRoot, "skills", skill, "SKILL.md"),
          "utf8",
        ),
      );
      expect(await readFile(path.join(destination, "source.txt"), "utf8")).toBe(
        await readFile(
          path.join(sourceRoot, "skills", skill, "source.txt"),
          "utf8",
        ),
      );
    }

    for (const backupId of inspectedIds) {
      const inspection = envelope<{
        backupId: string;
        phase: string;
        receiptPath: string;
        receipt: { backupPath: string };
        observed: { backupKind: string; backupDigest: string };
      }>(
        invoke(
          [
            "--project",
            root,
            "skills",
            "replace",
            "inspect",
            backupId,
            "--json",
          ],
          root,
          env,
        ),
        "skills replace",
      );
      expect(inspection.data.backupId).toBe(backupId);
      expect(inspection.data.phase).toBe("complete");
      expect(inspection.data.receiptPath).toContain(backupId);
      expect(inspection.data.observed.backupKind).toBe("directory");
      expect(inspection.data.observed.backupDigest).toMatch(/^[a-f0-9]{64}$/);
      const originalSkill = openSpecSkills[replacementIds.indexOf(backupId)]!;
      const backupRoot = path.join(
        root,
        ...inspection.data.receipt.backupPath.split("/"),
      );
      expect(await readFile(path.join(backupRoot, "SKILL.md"), "utf8")).toBe(
        `# Local ${originalSkill}\n`,
      );
      expect(await readFile(path.join(backupRoot, "notes.txt"), "utf8")).toBe(
        `keep-${originalSkill}\n`,
      );
    }

    const doctor = envelope<{
      complete: boolean;
      targets: Array<{ target: string; state: string }>;
    }>(
      invoke(["--project", root, "skills", "doctor", "--json"], root, env),
      "skills doctor",
    );
    expect(doctor.data.complete).toBe(true);
    expect(doctor.data.targets).toHaveLength(11);
    expect(doctor.data.targets.map((target) => target.target).sort()).toEqual(
      compoundSkills.map((name) => `.omp/skills/${name}`).sort(),
    );
    expect(
      doctor.data.targets.every((target) => target.state === "owned"),
    ).toBe(true);

    const validation = envelope<{ schema: string; ok: boolean }>(
      invoke(
        ["--project", root, "schemas", "validate", schemaName, "--json"],
        root,
        env,
      ),
      "schemas validate",
    );
    expect(validation.data).toMatchObject({ schema: schemaName, ok: true });

    const status = envelope<{
      defaultSchema: string;
      changes: Array<{
        name: string;
        history: { created: string; currentSchema: string };
      }>;
    }>(invoke(["--project", root, "status", "--json"], root, env), "status");
    expect(status.data.defaultSchema).toBe(schemaName);
    expect(status.data.changes).toContainEqual(
      expect.objectContaining({
        name: changeName,
        history: expect.objectContaining({
          created: "Unknown",
          currentSchema: legacySchema,
        }),
      }),
    );
    expect(await readFile(legacyPin)).toEqual(originalPin);
    expect(
      await readFile(
        path.join(
          root,
          "openspec",
          "changes",
          changeName,
          ".opsx-provenance.json",
        ),
      ).catch(() => null),
    ).toBe(originalHistory);

    const adapterArgs = [
      "--project",
      root,
      "adapters",
      "install",
      "omp",
      "--scope",
      "project",
      "--schema",
      schemaName,
    ];
    const adapterPreview = envelope<{
      phase: string;
      confirmation: { token: string };
    }>(invoke([...adapterArgs, "--json"], root, env), "adapters install");
    expect(adapterPreview.data.phase).toBe("preview");
    envelope(
      invoke(
        [
          ...adapterArgs,
          "--apply-token",
          adapterPreview.data.confirmation.token,
          "--json",
        ],
        root,
        env,
      ),
      "adapters install",
    );
    const adapterInspection = envelope<{
      inspection: {
        status: string;
        installedFiles: string[];
        missingFiles: string[];
      };
    }>(
      invoke(
        [
          "--project",
          root,
          "adapters",
          "inspect",
          "omp",
          "--scope",
          "project",
          "--schema",
          schemaName,
          "--json",
        ],
        root,
        env,
      ),
      "adapters inspect",
    );
    expect(adapterInspection.data.inspection.status).toBe("intact");
    expect(adapterInspection.data.inspection.installedFiles).toHaveLength(9);
    expect(adapterInspection.data.inspection.missingFiles).toEqual([]);
  },
  { timeout: 120_000 },
);
