import { afterEach, expect, test } from "bun:test";
import { decode } from "@toon-format/toon";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listBundledSchemas } from "../../src/bundled/index.ts";
import { readSelectionReceipt } from "../../src/switch/index.ts";
import { resolveRevision } from "../../src/revisions/index.ts";
import { OpenSpecClient } from "../../src/openspec/client.ts";

const cli = fileURLToPath(new URL("../../src/domain/cli.ts", import.meta.url));
const schemaResources = path.resolve(import.meta.dir, "../../resources");
const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "opsx-cli-command-"));
  fixtures.push(root);
  await mkdir(path.join(root, "openspec", "changes"), { recursive: true });
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  return root;
}

function invoke(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): { code: number; stdout: string; stderr: string } {
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

test("older OpenSpec refuses schema installation and switch without writes or a rejection stack", async () => {
  const root = await fixture();
  const bin = path.join(root, "bin");
  await mkdir(bin);
  const executable = path.join(bin, "openspec");
  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.11.9; else echo unexpected-command >&2; exit 99; fi\n',
  );
  await chmod(executable, 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  for (const words of [
    ["schemas", "install", "intent-driven"],
    ["schema", "switch", "intent-driven", "--bundle", "default"],
  ]) {
    const result = invoke(["--project", root, "--json", ...words], root, env);
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "OPENSPEC_UNSUPPORTED" },
    });
    expect(result.stdout).toContain("https://github.com/Fission-AI/OpenSpec");
    expect(result.stderr).not.toContain("Unhandled");
    expect(result.stderr).not.toContain("at async");
    expect(result.stderr).not.toContain("unexpected-command");
  }
  expect(await stat(path.join(root, "openspec", "config.yaml"))).toBeTruthy();
  expect(
    await Bun.file(path.join(root, "openspec", "config.yaml")).text(),
  ).toBe("schema: spec-driven\n");
  expect(
    await Bun.file(
      path.join(root, "openspec", "schemas", "intent-driven"),
    ).exists(),
  ).toBe(false);
});

test("status JSON and default TOON retain the resolved project snapshot", async () => {
  const root = await fixture();
  const change = path.join(root, "openspec", "changes", "snapshot-fixture");
  await mkdir(change);
  await writeFile(path.join(change, ".openspec.yaml"), "schema: spec-driven\n");
  const json = invoke(["--project", root, "status", "--json"], root);
  expect(json.code).toBe(0);
  const parsed = JSON.parse(json.stdout) as {
    schemaVersion: number;
    command: string;
    ok: boolean;
    data: { root: string; changes: unknown[]; archive: unknown[] };
  };
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.command).toBe("status");
  expect(parsed.ok).toBe(true);
  expect(parsed.data.root).toBe(root);
  expect(parsed.data.changes).toEqual([
    expect.objectContaining({ name: "snapshot-fixture" }),
  ]);
  expect(parsed.data.archive).toEqual([]);

  const toon = invoke(["--project", root, "status"], root);
  expect(toon.code).toBe(0);
  const decoded = decode(toon.stdout) as typeof parsed;
  expect(decoded.schemaVersion).toBe(1);
  expect(decoded.data.root).toBe(root);
  expect(decoded.data.changes).toEqual(parsed.data.changes);
});

test("bundled schema catalog is available outside a project in both output modes", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "opsx-cli-no-project-"));
  fixtures.push(cwd);
  const json = invoke(["schemas", "bundled", "--json"], cwd);
  expect(json.code).toBe(0);
  const parsed = JSON.parse(json.stdout) as {
    schemaVersion: number;
    command: string;
    ok: boolean;
    data: Array<{ name: string }>;
  };
  expect(parsed.schemaVersion).toBe(1);
  expect(parsed.command).toBe("schemas");
  expect(parsed.ok).toBe(true);
  expect(parsed.data.map((item) => item.name)).toEqual(listBundledSchemas());

  const toon = invoke(["schemas", "bundled"], cwd);
  expect(toon.code).toBe(0);
  const decoded = decode(toon.stdout) as typeof parsed;
  expect(decoded.data.map((item) => item.name)).toEqual(
    parsed.data.map((item) => item.name),
  );
});

test("bundle refusal reports real tiers while default switch preview keeps all 11 compound skills", async () => {
  const root = await fixture();
  const schema = "compound-intent-driven";
  const schemaInstall = invoke(
    ["--project", root, "schemas", "install", schema, "--json"],
    root,
  );
  expect(schemaInstall.code).toBe(0);
  const schemaToken = JSON.parse(schemaInstall.stdout).data.confirmation
    .token as string;
  expect(
    invoke(
      [
        "--project",
        root,
        "schemas",
        "install",
        "compound-intent-driven",
        "--apply-token",
        schemaToken,
        "--json",
      ],
      root,
    ).code,
  ).toBe(0);

  const unavailableInstall = invoke(
    [
      "--project",
      root,
      "skills",
      "install",
      schema,
      "--profile",
      "codex",
      "--bundle",
      "all",
      "--json",
    ],
    root,
  );
  expect(unavailableInstall.code).toBe(1);
  expect(JSON.parse(unavailableInstall.stdout)).toMatchObject({
    schemaVersion: 1,
    command: "skills install",
    ok: false,
    error: {
      code: "SKILL_BUNDLE_UNDECLARED",
      message: expect.stringContaining("Declared tiers: default"),
    },
  });
  const textRefusal = invoke(
    [
      "--project",
      root,
      "skills",
      "install",
      schema,
      "--profile",
      "codex",
      "--bundle",
      "all",
    ],
    root,
  );
  expect(textRefusal.code).toBe(1);
  expect(decode(textRefusal.stdout)).toMatchObject({
    ok: false,
    error: {
      code: "SKILL_BUNDLE_UNDECLARED",
      message: expect.stringContaining("Declared tiers: default"),
    },
  });
  await expect(
    access(path.join(root, ".agents", "skills", "ce-brainstorm")),
  ).rejects.toThrow();
  expect(await readSelectionReceipt(root)).toBeNull();

  const unavailable = invoke(
    [
      "--project",
      root,
      "schema",
      "switch",
      "compound-intent-driven",
      "--profile",
      "codex",
      "--bundle",
      "all",
      "--json",
    ],
    root,
  );
  expect(unavailable.code).toBe(1);
  const refusal = JSON.parse(unavailable.stdout);
  expect(refusal).toMatchObject({
    schemaVersion: 1,
    command: "schema switch",
    ok: false,
    data: {
      phase: "preview",
      plan: { canApply: false },
    },
  });
  expect(refusal.data.plan.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "SKILL_BUNDLE_UNDECLARED",
        message: expect.stringContaining("Declared tiers: default"),
      }),
    ]),
  );
  expect(
    refusal.data.plan.diagnostics.find(
      (item: { code: string }) => item.code === "SKILL_BUNDLE_UNDECLARED",
    ).message,
  ).toContain("default bundle contains every declared skill");
  await expect(
    access(path.join(root, ".agents", "skills", "ce-brainstorm")),
  ).rejects.toThrow();
  expect(await Bun.file(path.join(root, "openspec/config.yaml")).text()).toBe(
    "schema: spec-driven\n",
  );
  expect(await readSelectionReceipt(root)).toBeNull();

  const bin = path.join(root, "bin");
  await mkdir(bin);
  const git = path.join(bin, "git");
  await writeFile(
    git,
    `#!/bin/sh\nif [ "$1" != "clone" ]; then exit 99; fi\ncase "$6" in\n  *EveryInc*) names='ce-brainstorm ce-plan ce-work ce-simplify-code ce-code-review ce-compound' ;;\n  *) names='openspec-explore openspec-propose openspec-apply-change openspec-sync-specs openspec-archive-change' ;;\nesac\nfor name in $names; do\n  mkdir -p "$7/skills/$name"\n  printf '%s\\n' "# $name" > "$7/skills/$name/SKILL.md"\ndone\n`,
  );
  await chmod(git, 0o755);
  const text = invoke(
    [
      "--project",
      root,
      "schema",
      "switch",
      "compound-intent-driven",
      "--profile",
      "codex",
      "--bundle",
      "default",
    ],
    root,
    { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
  );
  expect(text.code).toBe(0);
  const preview = decode(text.stdout) as {
    data: { plan: { canApply: boolean; profiles: { targets: unknown[] } } };
  };
  expect(preview.data.plan.canApply).toBe(true);
  expect(preview.data.plan.profiles.targets).toHaveLength(11);
  await expect(
    access(path.join(root, ".agents", "skills", "ce-brainstorm")),
  ).rejects.toThrow();
  expect(
    await Bun.file(path.join(root, "openspec", "config.yaml")).text(),
  ).toBe("schema: spec-driven\n");
});

test("skills inspect gives bundled guidance only for proven known schema misses", async () => {
  const root = await fixture();
  const bin = path.join(root, "bin");
  await mkdir(bin);
  const executable = path.join(bin, "openspec");
  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.13.2; exit 0; fi\necho "Schema \'compound-intent-driven\' not found" >&2\nexit 1\n',
  );
  await chmod(executable, 0o755);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  const missing = invoke(
    [
      "--project",
      root,
      "skills",
      "inspect",
      "compound-intent-driven",
      "--json",
    ],
    root,
    env,
  );
  expect(missing.code).toBe(1);
  expect(missing.stderr).toBe("");
  expect(JSON.parse(missing.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: {
      code: "OPENSPEC_FAILED",
      message: expect.stringContaining(
        "schemas bundled compound-intent-driven",
      ),
    },
  });
  expect(missing.stdout).toContain(
    "schemas install compound-intent-driven --project <root>",
  );
  const unknownSchema = invoke(
    ["--project", root, "skills", "inspect", "not-a-bundled-schema", "--json"],
    root,
    env,
  );
  expect(unknownSchema.code).toBe(1);
  expect(JSON.parse(unknownSchema.stdout)).toMatchObject({
    ok: false,
    error: { code: "OPENSPEC_FAILED" },
  });
  expect(unknownSchema.stdout).not.toContain("schemas bundled");

  const help = invoke(["--help"], root);
  expect(help.stdout).toContain(
    "schemas install <bundled-schema-name> --project <root>",
  );
  expect(help.stdout).toContain("<bundled-schema-name>");
  expect(help.stdout).toContain("Install packaged schema files only");

  const notFoundPath = path.join(root, "bundled-source");
  await mkdir(notFoundPath);
  const pathInstall = invoke(
    ["--project", root, "schemas", "install", notFoundPath, "--json"],
    root,
    env,
  );
  expect(pathInstall.code).toBe(1);
  expect(JSON.parse(pathInstall.stdout)).toMatchObject({
    ok: false,
    error: { code: "BUNDLED_SCHEMA_NOT_FOUND" },
  });
  await expect(
    access(path.join(root, "openspec", "schemas", path.basename(notFoundPath))),
  ).rejects.toThrow();

  await writeFile(
    executable,
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.13.2; exit 0; fi\necho "OpenSpec config parse failure" >&2\nexit 1\n',
  );
  const unrelated = invoke(
    [
      "--project",
      root,
      "skills",
      "inspect",
      "compound-intent-driven",
      "--json",
    ],
    root,
    env,
  );
  expect(unrelated.code).toBe(1);
  expect(JSON.parse(unrelated.stdout)).toMatchObject({
    ok: false,
    error: {
      code: "OPENSPEC_FAILED",
      message: expect.stringContaining("OpenSpec config parse failure"),
    },
  });
  expect(unrelated.stdout).not.toContain("schemas bundled");

  await writeFile(
    executable,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.13.2; exit 0; fi\nif [ "$1" = "schema" ] && [ "$2" = "which" ]; then printf '%s\\n' '{"name":"compound-intent-driven","path":"${path.join(schemaResources, "openspec/schemas/compound-intent-driven")}","shadows":[]}'; exit 0; fi\necho "unexpected command" >&2\nexit 99\n`,
  );
  const inspectUnavailable = invoke(
    [
      "--project",
      root,
      "skills",
      "inspect",
      "compound-intent-driven",
      "--bundle",
      "all",
      "--json",
    ],
    root,
    env,
  );
  expect(inspectUnavailable.code).toBe(0);
  const inspected = JSON.parse(inspectUnavailable.stdout);
  expect(inspected).toMatchObject({
    schemaVersion: 1,
    ok: true,
    data: { requestedBundle: "all" },
  });
  expect(
    inspected.data.bundles.map((item: { name: string; available: boolean }) => [
      item.name,
      item.available,
    ]),
  ).toEqual([
    ["default", true],
    ["recommended", false],
    ["all", false],
  ]);
  expect(inspected.data.bundles[0].declarations).toHaveLength(11);
  expect(inspected.data.bundles[1].declarations).toEqual([]);
  expect(inspected.data.bundles[2].declarations).toEqual([]);
});

test("create and pin reconciliation refuse undeclared tiers without recording selection", async () => {
  const root = await fixture();
  const schema = "compound-intent-driven";
  const install = invoke(
    ["--project", root, "schemas", "install", schema, "--json"],
    root,
  );
  expect(install.code).toBe(0);
  const token = JSON.parse(install.stdout).data.confirmation.token as string;
  expect(
    invoke(
      [
        "--project",
        root,
        "schemas",
        "install",
        schema,
        "--apply-token",
        token,
        "--json",
      ],
      root,
    ).code,
  ).toBe(0);

  const creation = invoke(
    [
      "--project",
      root,
      "change",
      "create",
      "bad-tier",
      "--description",
      "Reject an unavailable bundle",
      "--schema",
      schema,
      "--profile",
      "codex",
      "--bundle",
      "all",
      "--json",
    ],
    root,
  );
  expect(creation.code).toBe(1);
  expect(JSON.parse(creation.stdout)).toMatchObject({
    ok: false,
    error: {
      code: "SKILL_BUNDLE_UNDECLARED",
      message: expect.stringContaining("Declared tiers: default"),
    },
  });
  await expect(
    access(path.join(root, "openspec", "changes", "bad-tier")),
  ).rejects.toThrow();

  const legacy = path.join(root, "openspec", "changes", "unassociated-tier");
  await mkdir(legacy);
  await writeFile(path.join(legacy, ".openspec.yaml"), `schema: ${schema}\n`);
  const revision = await resolveRevision(new OpenSpecClient(root), schema);
  const reconcile = invoke(
    [
      "--project",
      root,
      "skills",
      "reconcile",
      "unassociated-tier",
      "--revision-digest",
      revision.digest,
      "--bundle",
      "all",
      "--json",
    ],
    root,
  );
  expect(reconcile.code).toBe(1);
  expect(JSON.parse(reconcile.stdout)).toMatchObject({
    ok: false,
    error: {
      code: "SKILL_BUNDLE_UNDECLARED",
      message: expect.stringContaining("Declared tiers: default"),
    },
  });
  await expect(
    access(path.join(legacy, ".opsx-provenance.json")),
  ).rejects.toThrow();
});

test("bundled schema validation uses OpenSpec schema validate outside a project", async () => {
  const cwd = await mkdtemp(
    path.join(os.tmpdir(), "opsx-cli-schema-validate-"),
  );
  fixtures.push(cwd);
  const name = "compound-intent-driven";
  expect(listBundledSchemas()).toContain(name);
  const result = invoke(["schemas", "validate", name, "--json"], cwd);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    schemaVersion: 1,
    command: "schemas validate",
    ok: true,
    data: {
      schema: name,
      source: "bundled",
      ok: true,
      result: { valid: true },
    },
  });
});

test(
  "adapter install preview refuses a conflicting target with a nonzero envelope",
  async () => {
    const root = await fixture();
    const schema = "compound-intent-driven";
    const installArgs = [
      "--project",
      root,
      "schemas",
      "install",
      schema,
      "--json",
    ];
    const installPreview = JSON.parse(invoke(installArgs, root).stdout);
    expect(
      invoke(
        [
          ...installArgs.slice(0, -1),
          "--apply-token",
          installPreview.data.confirmation.token,
          "--json",
        ],
        root,
      ).code,
    ).toBe(0);
    const target = path.join(
      root,
      ".pi",
      "prompts",
      "opsx-ce-bulk-continue.md",
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "user-owned content\n");
    const result = invoke(
      [
        "--project",
        root,
        "adapters",
        "install",
        "pi",
        "--scope",
        "project",
        "--schema",
        schema,
        "--json",
      ],
      root,
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "adapters install",
      ok: false,
      error: { code: "PREVIEW_BLOCKED" },
      data: {
        phase: "preview",
        plan: { action: "refuse", status: "collision" },
      },
    });
  },
  { timeout: 30_000 },
);

test(
  "schema installation is preview-only until its exact request token is supplied",
  async () => {
    const root = await fixture();
    const schema = "compound-intent-driven";
    expect(listBundledSchemas()).toContain(schema);
    const destination = path.join(root, "openspec", "schemas", schema);
    const preview = invoke(
      ["schemas", "install", schema, "--project", root, "--json"],
      root,
    );
    expect(preview.code).toBe(0);
    const plan = JSON.parse(preview.stdout) as {
      schemaVersion: number;
      ok: boolean;
      data: {
        phase: string;
        plan: { destination: string };
        confirmation: { token: string };
      };
    };
    expect(plan.schemaVersion).toBe(1);
    expect(plan.ok).toBe(true);
    expect(plan.data.phase).toBe("preview");
    expect(plan.data.plan.destination).toBe(destination);
    await expect(access(destination)).rejects.toThrow();

    const applied = invoke(
      [
        "schemas",
        "install",
        schema,
        "--project",
        root,
        "--apply-token",
        plan.data.confirmation.token,
        "--json",
      ],
      root,
    );
    expect(applied.code).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "schemas install",
      ok: true,
      data: { phase: "applied" },
    });
    expect((await stat(destination)).isDirectory()).toBe(true);
    const validation = invoke(
      ["--project", root, "schemas", "validate", schema, "--json"],
      root,
    );
    expect(validation.code).toBe(0);
    expect(JSON.parse(validation.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "schemas validate",
      ok: true,
      data: { schema, source: "project", ok: true, result: { valid: true } },
    });
    const createArgs = [
      "--project",
      root,
      "change",
      "create",
      "handoff-proof",
      "--description",
      "Exercise blocked handoff preview",
    ];
    const createPreview = invoke([...createArgs, "--json"], root);
    const createToken = JSON.parse(createPreview.stdout).data.confirmation
      .token as string;
    const createApplied = invoke(
      [...createArgs, "--apply-token", createToken, "--json"],
      root,
    );
    expect(createApplied.code).toBe(0);
    const handoff = invoke(
      [
        "--project",
        root,
        "change",
        "schema",
        "handoff-proof",
        schema,
        "--json",
      ],
      root,
    );
    expect(handoff.code).toBe(1);
    expect(JSON.parse(handoff.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "change schema",
      ok: false,
      error: { code: "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED" },
    });
  },
  { timeout: 30_000 },
);

test(
  "skills doctor skips no-skill legacy pins while preserving exact reconciliation",
  async () => {
    const root = await fixture();
    const args = [
      "--project",
      root,
      "change",
      "create",
      "known-pin",
      "--description",
      "No-skill association",
      "--json",
    ];
    const preview = JSON.parse(invoke(args, root).stdout) as {
      data: { confirmation: { token: string } };
    };
    const applied = invoke(
      [
        ...args.slice(0, -1),
        "--apply-token",
        preview.data.confirmation.token,
        "--json",
      ],
      root,
    );
    expect(applied.code).toBe(0);
    const known = JSON.parse(
      invoke(["--project", root, "skills", "doctor", "--json"], root).stdout,
    );
    expect(known).toMatchObject({
      ok: true,
      data: { complete: true, required: { complete: true, targets: [] } },
    });

    const legacy = path.join(root, "openspec", "changes", "unassociated");
    await mkdir(legacy);
    await writeFile(
      path.join(legacy, ".openspec.yaml"),
      "schema: spec-driven\n",
    );
    const legacyDoctor = JSON.parse(
      invoke(["--project", root, "skills", "doctor", "--json"], root).stdout,
    );
    expect(legacyDoctor).toMatchObject({
      ok: true,
      data: { complete: true, required: { complete: true, targets: [] } },
    });
    expect(legacyDoctor.data.required.diagnostics).toEqual([]);
    expect(
      JSON.parse(
        invoke(["--project", root, "changes", "unassociated", "--json"], root)
          .stdout,
      ).data.selection,
    ).toBeNull();
    const disableResult = invoke(
      ["--project", root, "skills", "disable", ".omp/skills/example", "--json"],
      root,
    );
    const disable = JSON.parse(disableResult.stdout);
    expect(disableResult.code).toBe(1);
    expect(disable).toMatchObject({
      ok: false,
      error: { code: "PREVIEW_BLOCKED" },
      data: {
        phase: "preview",
        plan: { pinGuardComplete: true, canApply: false },
      },
    });
    expect(
      disable.data.plan.diagnostics.map((item: { code: string }) => item.code),
    ).toContain("RESOURCE_NOT_INSTALLED");
    const revision = await resolveRevision(
      new OpenSpecClient(root),
      "spec-driven",
    );
    const reconcileArgs = [
      "--project",
      root,
      "skills",
      "reconcile",
      "unassociated",
      "--revision-digest",
      revision.digest,
      "--bundle",
      "default",
    ];
    const wrong = invoke(
      [
        ...reconcileArgs.slice(0, 6),
        "0".repeat(64),
        ...reconcileArgs.slice(7),
        "--json",
      ],
      root,
    );
    expect(JSON.parse(wrong.stdout)).toMatchObject({
      ok: false,
      error: { code: "RESOURCE_PIN_REVISION_CHANGED" },
    });
    const reconciliation = JSON.parse(
      invoke([...reconcileArgs, "--json"], root).stdout,
    );
    expect(reconciliation).toMatchObject({
      ok: true,
      data: {
        phase: "preview",
        target: { change: "unassociated", revisionDigest: revision.digest },
      },
    });
    await expect(
      access(path.join(legacy, ".opsx-provenance.json")),
    ).rejects.toThrow();
    const stale = invoke(
      [
        ...reconcileArgs,
        "--skill-host",
        "omp",
        "--apply-token",
        reconciliation.data.confirmation.token,
        "--json",
      ],
      root,
    );
    expect(JSON.parse(stale.stdout)).toMatchObject({
      ok: false,
      error: { code: "APPLY_TOKEN_STALE" },
    });
    const reconciled = invoke(
      [
        ...reconcileArgs,
        "--apply-token",
        reconciliation.data.confirmation.token,
        "--json",
      ],
      root,
    );
    expect(JSON.parse(reconciled.stdout)).toMatchObject({
      ok: true,
      data: { phase: "applied" },
    });
    expect(
      JSON.parse(
        invoke(["--project", root, "changes", "unassociated", "--json"], root)
          .stdout,
      ).data.selection,
    ).toMatchObject({
      effectiveRevision: { digest: revision.digest },
      profiles: [],
      skillHosts: [],
      skillBundle: "default",
    });
    const recovered = JSON.parse(
      invoke(["--project", root, "skills", "doctor", "--json"], root).stdout,
    );
    expect(recovered).toMatchObject({
      ok: true,
      data: { complete: true, required: { complete: true, targets: [] } },
    });
  },
  { timeout: 30_000 },
);

test(
  "skills doctor and disable block legacy pins for schemas with managed skills",
  async () => {
    const root = await fixture();
    const schema = "compound-intent-driven";
    const schemaRoot = path.join(root, "openspec", "schemas", schema);
    await mkdir(path.dirname(schemaRoot), { recursive: true });
    await cp(
      path.join(schemaResources, "openspec", "schemas", schema),
      schemaRoot,
      { recursive: true },
    );
    const legacy = path.join(
      root,
      "openspec",
      "changes",
      "skill-bearing-legacy",
    );
    await mkdir(legacy);
    await writeFile(
      path.join(legacy, ".openspec.yaml"),
      "schema: " + schema + "\n",
    );

    const doctor = invoke(
      ["--project", root, "skills", "doctor", "--json"],
      root,
    );
    expect(doctor.code).toBe(1);
    const report = JSON.parse(doctor.stdout);
    expect(report).toMatchObject({
      ok: false,
      data: { complete: false, required: { complete: false } },
    });
    expect(
      report.data.required.diagnostics.some((item: { message: string }) =>
        item.message.includes("has no verified skill selection"),
      ),
    ).toBe(true);

    const disable = invoke(
      ["--project", root, "skills", "disable", ".omp/skills/example", "--json"],
      root,
    );
    expect(disable.code).toBe(1);
    expect(JSON.parse(disable.stdout)).toMatchObject({
      ok: false,
      error: { code: "SKILL_REQUIREMENTS_INCOMPLETE" },
    });
  },
  { timeout: 30_000 },
);

test(
  "change creation routes through lifecycle preview and requires its request-bound token",
  async () => {
    const root = await fixture();
    const name = "cli-change";
    const args = [
      "--project",
      root,
      "change",
      "create",
      name,
      "--description",
      "Exercise CLI lifecycle wiring",
    ];
    const preview = invoke([...args, "--json"], root);
    expect(preview.code).toBe(0);
    const plan = JSON.parse(preview.stdout) as {
      ok: boolean;
      data: { phase: string; confirmation: { token: string } };
    };
    expect(plan.ok).toBe(true);
    expect(plan.data.phase).toBe("preview");
    await expect(
      access(path.join(root, "openspec", "changes", name)),
    ).rejects.toThrow();

    const applied = invoke(
      [...args, "--apply-token", plan.data.confirmation.token, "--json"],
      root,
    );
    expect(applied.code).toBe(0);
    expect(JSON.parse(applied.stdout)).toMatchObject({
      schemaVersion: 1,
      command: "change create",
      ok: true,
      data: { phase: "applied" },
    });
    expect(
      (await stat(path.join(root, "openspec", "changes", name))).isDirectory(),
    ).toBe(true);
  },
  { timeout: 30_000 },
);

test("non-TTY dashboard and unsupported mutation flags fail as structured errors", async () => {
  const root = await fixture();
  const dashboard = invoke(["--project", root, "--json"], root);
  expect(dashboard.code).toBe(1);
  expect(JSON.parse(dashboard.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: { code: "TTY_REQUIRED" },
  });

  const schema = listBundledSchemas()[0]!;
  const unknown = invoke(
    ["schemas", "install", schema, "--project", root, "--yes", "--json"],
    root,
  );
  expect(unknown.code).toBe(1);
  expect(JSON.parse(unknown.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: { code: "USAGE" },
  });
  await expect(
    access(path.join(root, "openspec", "schemas", schema)),
  ).rejects.toThrow();

  const shortUnknown = invoke(["-y", "status", "--json"], root);
  expect(shortUnknown.code).toBe(1);
  expect(JSON.parse(shortUnknown.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: { code: "USAGE", message: "Unknown flag: -y" },
  });
  const ambiguous = invoke(
    ["--project", root, "--project", root, "status", "--json"],
    root,
  );
  expect(ambiguous.code).toBe(1);
  expect(JSON.parse(ambiguous.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: { code: "USAGE" },
  });
});

test(
  "schema switch preview and Apply preserve selected hosts and exact effects",
  async () => {
    const root = await fixture();
    const schema = "cli-host-fixture";
    const schemaRoot = path.join(root, "openspec", "schemas", schema);
    await writeFile(
      path.join(root, "openspec", "config.yaml"),
      "schema: minimalist\n",
    );
    await mkdir(path.dirname(schemaRoot), { recursive: true });
    await cp(
      path.join(schemaResources, "openspec", "schemas", "minimalist"),
      schemaRoot,
      { recursive: true },
    );
    await writeFile(path.join(schemaRoot, "skills.txt"), "");
    const schemaFile = path.join(schemaRoot, "schema.yaml");
    const schemaText = (await Bun.file(schemaFile).text()).replace(
      "name: minimalist",
      `name: ${schema}`,
    );
    await writeFile(schemaFile, schemaText);
    const legacyPreview = invoke(
      ["--project", root, "schema", "switch", schema, "--json"],
      root,
    );
    expect(legacyPreview.code).toBe(0);
    const legacyHosts = JSON.parse(legacyPreview.stdout).data.plan
      .skillHosts as Array<{ destination: string; targets: unknown[] }>;
    expect(legacyHosts.length).toBeGreaterThan(0);
    expect(legacyHosts.every((host) => host.targets.length === 0)).toBe(true);
    await expect(access(path.join(root, ".omp", "skills"))).rejects.toThrow();
    await expect(
      access(path.join(root, ".atomic", "skills")),
    ).rejects.toThrow();
    const args = [
      "--project",
      root,
      "schema",
      "switch",
      schema,
      "--skill-host",
      "omp",
      "--skill-host",
      "atomic",
    ];
    const preview = invoke([...args, "--json"], root);
    expect(preview.code).toBe(0);
    const output = JSON.parse(preview.stdout) as {
      ok: boolean;
      data: {
        phase: string;
        plan: {
          skillHosts: Array<{
            host: string;
            destination: string;
            targets: unknown[];
          }>;
        };
        confirmation: { token: string };
      };
    };
    expect(output.ok).toBe(true);
    expect(output.data.phase).toBe("preview");
    expect(output.data.plan.skillHosts.map((host) => host.host).sort()).toEqual(
      ["atomic", "omp", "opencode", "pi", "senpi"],
    );
    expect(
      output.data.plan.skillHosts.every((host) => host.targets.length === 0),
    ).toBe(true);
    for (const host of output.data.plan.skillHosts)
      await expect(access(host.destination)).rejects.toThrow();
    expect(
      await Bun.file(path.join(root, "openspec", "config.yaml")).text(),
    ).toBe("schema: minimalist\n");

    const staleSelection = invoke(
      [
        "--project",
        root,
        "schema",
        "switch",
        schema,
        "--skill-host",
        "omp",
        "--apply-token",
        output.data.confirmation.token,
        "--json",
      ],
      root,
    );
    expect(staleSelection.code).toBe(1);
    expect(JSON.parse(staleSelection.stdout)).toMatchObject({
      ok: false,
      error: { code: "APPLY_TOKEN_STALE" },
    });
    expect(
      await Bun.file(path.join(root, "openspec", "config.yaml")).text(),
    ).toBe("schema: minimalist\n");

    const applied = invoke(
      [...args, "--apply-token", output.data.confirmation.token, "--json"],
      root,
    );
    expect(applied.code, applied.stdout).toBe(0);
    const appliedOutput = JSON.parse(applied.stdout);
    expect(appliedOutput).toMatchObject({
      ok: true,
      command: "schema switch",
      data: { phase: "applied" },
    });
    expect(
      await Bun.file(path.join(root, "openspec", "config.yaml")).text(),
    ).toBe("schema: cli-host-fixture\n");
    const receipt = await readSelectionReceipt(root);
    expect(receipt).toMatchObject({ profiles: [], skillBundle: "default" });
    expect(receipt?.skillHosts).toEqual(["atomic", "omp"]);
  },
  { timeout: 60_000 },
);

test("schema switch validates every repeated skill-host value before preview", async () => {
  const root = await fixture();
  const schema = "minimalist";
  expect(listBundledSchemas()).toContain(schema);
  const invalid = invoke(
    [
      "--project",
      root,
      "schema",
      "switch",
      schema,
      "--skill-host",
      "omp",
      "--skill-host",
      "unknown",
      "--json",
    ],
    root,
  );
  expect(invalid.code).toBe(1);
  expect(JSON.parse(invalid.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: { code: "USAGE" },
  });
  const duplicate = invoke(
    [
      "--project",
      root,
      "schema",
      "switch",
      schema,
      "--skill-host",
      "omp",
      "--skill-host",
      "omp",
      "--json",
    ],
    root,
  );
  expect(duplicate.code).toBe(1);
  expect(JSON.parse(duplicate.stdout)).toMatchObject({
    schemaVersion: 1,
    ok: false,
    error: { code: "USAGE" },
  });
  expect(
    await Bun.file(path.join(root, "openspec", "config.yaml")).text(),
  ).toBe("schema: spec-driven\n");
});
