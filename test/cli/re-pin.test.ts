import { afterEach, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { changeDirectory } from "../../src/archive/index.ts";
import { previewChangeRePin } from "../../src/cli/repin.ts";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import { revisionRef } from "../../src/provenance/index.ts";
import { resolveRevision, retainRevision } from "../../src/revisions/index.ts";
import {
  applySkillInstall,
  previewSkillInstall,
} from "../../src/resources/index.ts";
import {
  validateChange,
  validateChangeAgainst,
} from "../../src/validation/index.ts";
import { linkedFixture } from "./portable-fixture.ts";
const roots: string[] = [];
async function completeWorkflow(root: string, change: string) {
  const dir = await changeDirectory(root, change);
  await import("node:fs/promises").then(async (fs) => {
    await fs.writeFile(
      path.join(dir, "proposal.md"),
      "## Why\n\nReason.\n\n## What Changes\n\n- Add behavior.\n\n## Capabilities\n\n### New Capabilities\nNone.\n\n### Modified Capabilities\n- fixture\n\n## Impact\n\nCLI.\n",
    );
    await fs.mkdir(path.join(dir, "specs/fixture"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "specs/fixture/spec.md"),
      "## ADDED Requirements\n\n### Requirement: Fixture behavior\nThe system MUST support the fixture behavior.\n\n#### Scenario: Works\n- **WHEN** requested\n- **THEN** it works\n",
    );
    await fs.writeFile(
      path.join(dir, "design.md"),
      "# Design\n\n## Context\nFixture.\n\n## Goals / Non-Goals\nGoal.\n\n## Decisions\nUse existing behavior.\n\n## Risks / Trade-offs\nNone.\n",
    );
    await fs.writeFile(
      path.join(dir, "adr.md"),
      "# Architecture Decision Record\n\n## Status\nAccepted\n\n## Context\nFixture.\n\n## Decision\nUse the existing implementation.\n\n## Consequences\nNo change.\n",
    );
    await fs.writeFile(
      path.join(dir, "tasks.md"),
      "## 1. Implementation\n- [ ] 1.1 Implement fixture behavior\n",
    );
  });
}

afterEach(async () =>
  Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  ),
);
function cli(root: string, ...args: string[]) {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      path.resolve(import.meta.dir, "../../src/domain/cli.ts"),
      "--project",
      root,
      "--json",
      ...args,
    ],
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    output: new TextDecoder().decode(result.stdout),
  };
}
async function treeBytes(root: string): Promise<Array<[string, Buffer]>> {
  const files: Array<[string, Buffer]> = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else
        files.push([
          path.relative(root, file),
          entry.isSymbolicLink()
            ? Buffer.from(`symlink:${await readlink(file)}`)
            : await readFile(file),
        ]);
    }
  }
  await visit(root);
  return files.sort(([left], [right]) => left.localeCompare(right));
}
test("independent-clone same-name same-digest re-pin is a read-only ready preview", async () => {
  const f = await linkedFixture(roots),
    clone = path.join(path.dirname(f.linked), "clone");
  execFileSync("git", ["clone", "--quiet", f.linked, clone]);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  await cp(
    path.join(f.linked, "openspec/changes"),
    path.join(clone, "openspec/changes"),
    { recursive: true },
  );
  await cp(
    path.join(f.linked, "openspec/.opsx"),
    path.join(clone, "openspec/.opsx"),
    { recursive: true },
  );
  await completeWorkflow(clone, f.change);
  const dir = await changeDirectory(clone, f.change),
    file = path.join(dir, ".opsx-provenance.json"),
    value = JSON.parse(await readFile(file, "utf8"));
  value.created.source = path.join(f.original, "openspec/schemas/portable");
  delete value.created.origin;
  await writeFile(file, JSON.stringify(value));
  const before = await treeBytes(clone),
    response = cli(clone, "change", "re-pin", f.change, "portable");
  expect(response.code, response.output).toBe(0);
  expect(JSON.parse(response.output)).toMatchObject({
    ok: true,
    data: {
      ok: true,
      phase: "preview",
      data: {
        ready: true,
        noOp: false,
        historicalOrigin: {
          status: "unknown",
          oldLocation: path.join(f.original, "openspec/schemas/portable"),
          currentLocation: path.join(clone, "openspec/schemas/portable"),
          warning:
            "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.",
        },
      },
    },
  });
  const confirmation = JSON.parse(response.output).data.confirmation;
  expect(confirmation.token).toStartWith("opsx-preview-v1.");
  expect(confirmation.exactTarget).toContain(
    "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.",
  );
  expect(confirmation.exactTarget).toContain(
    `Old location: ${path.join(f.original, "openspec/schemas/portable")}`,
  );
  expect(confirmation.exactTarget).toContain(
    `Verified current location: ${path.join(clone, "openspec/schemas/portable")}`,
  );
  expect(await treeBytes(clone)).toEqual(before);
  const ordinary = await validateChange(clone, f.change);
  expect(ordinary.ok).toBe(false);
  expect(
    ordinary.findings.some((item) => item.code === "SCHEMA_REVISION_SHADOW"),
  ).toBe(true);
  const preview = JSON.parse(response.output).data.data;
  const unreviewed = await validateChangeAgainst(clone, f.change, "portable", {
    targetSchemaRoot: preview.to.source,
    reviewedHistoricalOrigin: { recorded: preview.from, target: preview.from },
  });
  expect(unreviewed.ok).toBe(false);
  expect(await treeBytes(clone)).toEqual(before);
});
test("healthy linked-worktree pin is an event-free no-op", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const before = await treeBytes(f.linked);
  const response = cli(f.linked, "change", "re-pin", f.change, "portable");
  expect(response.code, response.output).toBe(0);
  expect(JSON.parse(response.output)).toMatchObject({
    ok: true,
    data: { ok: true, phase: "preview", data: { noOp: true } },
  });
  expect(
    JSON.parse(response.output).data.data.historicalOrigin,
  ).toBeUndefined();
  expect(await treeBytes(f.linked)).toEqual(before);
});

test("witnessed project pin permits reviewed cross-clone preview", async () => {
  const f = await linkedFixture(roots);
  const clone = path.join(path.dirname(f.linked), "witnessed-clone");
  execFileSync("git", ["clone", "--quiet", f.linked, clone]);
  await cp(
    path.join(f.linked, "openspec/changes"),
    path.join(clone, "openspec/changes"),
    { recursive: true },
  );
  await cp(
    path.join(f.linked, "openspec/.opsx"),
    path.join(clone, "openspec/.opsx"),
    { recursive: true },
  );
  await completeWorkflow(clone, f.change);
  const before = await treeBytes(clone);
  const response = await previewChangeRePin(clone, f.change, "portable", {
    profiles: [],
    noProfiles: false,
    skillHosts: [],
  });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  if (response.ok) {
    expect(response.data.ready).toBe(true);
    expect(response.data.noOp).toBe(false);
    expect(response.data.historicalOrigin).toBeUndefined();
    expect(response.confirmation?.token).toBeDefined();
  }
  expect(await treeBytes(clone)).toEqual(before);
});

test("vanished external project-shaped source remains unknown and changes the review token", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const file = path.join(
    f.linked,
    "openspec/changes/sample/.opsx-provenance.json",
  );
  const provenance = JSON.parse(await readFile(file, "utf8"));
  delete provenance.created.origin;
  await writeFile(file, JSON.stringify(provenance));
  const selection = { profiles: [], noProfiles: false, skillHosts: [] };
  const before = await treeBytes(f.linked);
  const original = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    selection,
  );
  expect(original.ok, JSON.stringify(original)).toBe(true);
  expect(await treeBytes(f.linked)).toEqual(before);

  const vanished = path.join(
    path.dirname(f.linked),
    "vanished-external",
    "openspec/schemas/portable",
  );
  provenance.created.source = vanished;
  await writeFile(file, JSON.stringify(provenance));
  const changedBefore = await treeBytes(f.linked);
  const reviewed = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    selection,
  );
  expect(reviewed.ok, JSON.stringify(reviewed)).toBe(true);
  if (original.ok && reviewed.ok) {
    expect(reviewed.data.historicalOrigin).toMatchObject({
      status: "unknown",
      oldLocation: vanished,
      currentLocation: path.join(f.linked, "openspec/schemas/portable"),
    });
    expect(reviewed.confirmation?.token).not.toBe(original.confirmation?.token);
    expect(reviewed.confirmation?.exactTarget).toContain(vanished);
  }
  expect(await treeBytes(f.linked)).toEqual(changedBefore);
  const ordinary = await validateChange(f.linked, f.change);
  expect(ordinary.ok).toBe(false);
});

test.each([
  ["malformed JSON", "not JSON"],
  ["unrecognized JSON", JSON.stringify({ items: [] })],
  [
    "different change JSON",
    JSON.stringify({
      items: [{ id: "other", type: "change", valid: true, issues: [] }],
    }),
  ],
])("%s strict validation output refuses a preview", async (_name, stdout) => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const original = OpenSpecClient.prototype.commandResult;
  const command = spyOn(
    OpenSpecClient.prototype,
    "commandResult",
  ).mockImplementation(async function (
    this: OpenSpecClient,
    ...args: string[]
  ) {
    if (
      args[0] === "validate" &&
      this.projectRoot.startsWith(path.join(os.tmpdir(), "opsx-validation-"))
    )
      return { status: 0, stdout, stderr: "" };
    return original.apply(this, args);
  });
  const before = await treeBytes(f.linked);
  try {
    const response = await previewChangeRePin(f.linked, f.change, "portable", {
      profiles: [],
      noProfiles: false,
      skillHosts: [],
    });
    expect(response.ok).toBe(false);
    expect(response.ok ? response.confirmation : undefined).toBeUndefined();
    expect(await treeBytes(f.linked)).toEqual(before);
  } finally {
    command.mockRestore();
  }
});

test("external absolute source with matching bytes cannot receive a project re-pin", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  await cp(
    path.join(f.linked, "openspec/schemas/portable"),
    path.join(f.linked, "external/portable"),
    { recursive: true },
  );
  const file = path.join(
    f.linked,
    "openspec/changes/sample/.opsx-provenance.json",
  );
  const provenance = JSON.parse(await readFile(file, "utf8"));
  provenance.created.source = path.join(f.linked, "external", "portable");
  delete provenance.created.origin;
  await writeFile(file, JSON.stringify(provenance));
  const before = await treeBytes(f.linked);
  const response = await previewChangeRePin(f.linked, f.change, "portable", {
    profiles: [],
    noProfiles: false,
    skillHosts: [],
  });
  expect(response.ok).toBe(false);
  expect(response.ok ? response.confirmation : undefined).toBeUndefined();
  expect(await treeBytes(f.linked)).toEqual(before);
});

test.each([
  [
    "dangling parent symlink",
    async (base: string, oldRoot: string) => {
      await symlink(path.join(base, "absent"), path.join(oldRoot, "openspec"));
    },
  ],
  [
    "redirected parent symlink",
    async (base: string, oldRoot: string) => {
      const elsewhere = path.join(base, "elsewhere");
      await mkdir(elsewhere);
      await symlink(elsewhere, path.join(oldRoot, "openspec"));
    },
  ],
  [
    "non-directory parent",
    async (_base: string, oldRoot: string) => {
      await writeFile(path.join(oldRoot, "openspec"), "preserved\n");
    },
  ],
])("%s in a historical source refuses a token without writes", async (_name, makeParent) => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const base = path.dirname(f.linked);
  const oldRoot = path.join(base, "legacy-root");
  await mkdir(oldRoot);
  await makeParent(base, oldRoot);
  const file = path.join(
    f.linked,
    "openspec/changes/sample/.opsx-provenance.json",
  );
  const provenance = JSON.parse(await readFile(file, "utf8"));
  provenance.created.source = path.join(oldRoot, "openspec/schemas/portable");
  delete provenance.created.origin;
  await writeFile(file, JSON.stringify(provenance));
  const before = await treeBytes(base);
  const response = await previewChangeRePin(f.linked, f.change, "portable", {
    profiles: [],
    noProfiles: false,
    skillHosts: [],
  });
  expect(response.ok, JSON.stringify(response)).toBe(false);
  expect(response.ok ? response.confirmation : undefined).toBeUndefined();
  expect(await treeBytes(base)).toEqual(before);
});

test("a shadow introduced at final resolution blocks reviewed historical origin", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const file = path.join(
    f.linked,
    "openspec/changes/sample/.opsx-provenance.json",
  );
  const provenance = JSON.parse(await readFile(file, "utf8"));
  delete provenance.created.origin;
  await writeFile(file, JSON.stringify(provenance));
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const original = OpenSpecClient.prototype.json;
  let lookups = 0;
  const json = spyOn(OpenSpecClient.prototype, "json").mockImplementation(
    async function <T>(this: OpenSpecClient, ...args: string[]): Promise<T> {
      const result = await original.bind(this)<T>(...args);
      if (
        args[0] === "schema" &&
        args[1] === "which" &&
        args[2] === "portable"
      ) {
        lookups++;
        if (lookups === 4 && typeof result === "object" && result !== null)
          Reflect.set(result, "shadows", [
            { source: "injected-external-shadow" },
          ]);
      }
      return result;
    },
  );
  const before = await treeBytes(f.linked);
  try {
    const response = await previewChangeRePin(f.linked, f.change, "portable", {
      profiles: [],
      noProfiles: false,
      skillHosts: [],
    });
    expect(lookups).toBeGreaterThanOrEqual(4);
    expect(response.ok).toBe(false);
    expect(response.ok ? response.confirmation : undefined).toBeUndefined();
    expect(JSON.stringify(response)).toContain("SCHEMA_REVISION_SHADOW");
    expect(await treeBytes(f.linked)).toEqual(before);
  } finally {
    json.mockRestore();
  }
  const ordinary = await validateChange(f.linked, f.change);
  expect(ordinary.ok).toBe(false);
  expect(
    ordinary.findings.some((item) => item.code === "SCHEMA_REVISION_SHADOW"),
  ).toBe(true);
});

test("strict validation execution failure refuses a preview", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const original = OpenSpecClient.prototype.commandResult;
  const command = spyOn(
    OpenSpecClient.prototype,
    "commandResult",
  ).mockImplementation(async function (
    this: OpenSpecClient,
    ...args: string[]
  ) {
    if (
      args[0] === "validate" &&
      this.projectRoot.startsWith(path.join(os.tmpdir(), "opsx-validation-"))
    )
      throw new Error("injected validation execution failure");
    return original.apply(this, args);
  });
  const before = await treeBytes(f.linked);
  try {
    const response = await previewChangeRePin(f.linked, f.change, "portable", {
      profiles: [],
      noProfiles: false,
      skillHosts: [],
    });
    expect(response.ok).toBe(false);
    expect(response.ok ? response.confirmation : undefined).toBeUndefined();
    expect(await treeBytes(f.linked)).toEqual(before);
  } finally {
    command.mockRestore();
  }
});

test("unknown isolated workflow status refuses a preview", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const original = OpenSpecClient.prototype.json;
  const json = spyOn(OpenSpecClient.prototype, "json").mockImplementation(
    async function <T>(this: OpenSpecClient, ...args: string[]): Promise<T> {
      const result = await original.bind(this)<T>(...args);
      if (
        args[0] === "status" &&
        this.projectRoot.startsWith(
          path.join(os.tmpdir(), "opsx-validation-"),
        ) &&
        typeof result === "object" &&
        result !== null
      )
        Reflect.set(result, "changeName", "other");
      return result;
    },
  );
  const before = await treeBytes(f.linked);
  try {
    const response = await previewChangeRePin(f.linked, f.change, "portable", {
      profiles: [],
      noProfiles: false,
      skillHosts: [],
    });
    expect(response.ok).toBe(false);
    expect(response.ok ? response.confirmation : undefined).toBeUndefined();
    expect(await treeBytes(f.linked)).toEqual(before);
  } finally {
    json.mockRestore();
  }
});
test("apply and recovery remain explicitly refused", async () => {
  const f = await linkedFixture(roots);
  const before = await treeBytes(f.linked);
  for (const flags of [
    ["--apply-token", "fake"],
    ["--apply-token", ""],
    ["--recover"],
  ]) {
    const response = cli(
      f.linked,
      "change",
      "re-pin",
      f.change,
      "portable",
      ...flags,
    );
    expect(response.code).not.toBe(0);
    expect(JSON.parse(response.output).ok).toBe(false);
    expect(await treeBytes(f.linked)).toEqual(before);
  }
});
test("associated empty profiles require explicit compatible review", async () => {
  const f = await linkedFixture(roots, true);
  await completeWorkflow(f.linked, f.change);
  const before = await treeBytes(f.linked);
  const base = ["change", "re-pin", f.change, "portable"];
  for (const flags of [
    [],
    ["--bundle", "default"],
    ["--bundle", "default", "--no-profiles", "--profile", "codex"],
    ["--bundle", "default", "--no-profiles", "--no-profiles"],
    ["--bundle", "default", "--no-profiles", "--skill-host", "pi"],
  ]) {
    const response = cli(f.linked, ...base, ...flags);
    expect(response.code, response.output).not.toBe(0);
    expect(JSON.parse(response.output).ok).toBe(false);
    expect(await treeBytes(f.linked)).toEqual(before);
  }
  const reviewed = cli(
    f.linked,
    ...base,
    "--bundle",
    "default",
    "--no-profiles",
  );
  expect(reviewed.code, reviewed.output).toBe(0);
  expect(JSON.parse(reviewed.output).data.data.noOp).toBe(true);
  expect(await treeBytes(f.linked)).toEqual(before);
});
test("unsafe pin, target, retention, history, and workflow refuse without writes", async () => {
  const scenarios: Array<[string, (root: string) => Promise<void>]> = [
    [
      "inherited pin",
      async (root) =>
        rm(path.join(root, "openspec/changes/sample/.openspec.yaml")),
    ],
    [
      "different pin",
      async (root) =>
        writeFile(
          path.join(root, "openspec/changes/sample/.openspec.yaml"),
          "schema: other\n",
        ),
    ],
    [
      "changed content",
      async (root) =>
        writeFile(
          path.join(root, "openspec/schemas/portable/schema.yaml"),
          "name: portable\n",
        ),
    ],
    [
      "missing retention",
      async (root) =>
        rm(path.join(root, "openspec/.opsx/revisions"), { recursive: true }),
    ],
    [
      "corrupt retention",
      async (root) => {
        const file = path.join(
          root,
          "openspec/changes/sample/.opsx-provenance.json",
        );
        const value = JSON.parse(await readFile(file, "utf8"));
        await writeFile(
          path.join(
            root,
            "openspec/.opsx/revisions/portable",
            value.created.digest,
            "schema.yaml",
          ),
          "corrupt\n",
        );
      },
    ],
    [
      "incomplete workflow",
      async (root) =>
        rm(path.join(root, "openspec/changes/sample/proposal.md")),
    ],
    [
      "untracked target",
      async (root) => {
        execFileSync(
          "git",
          ["rm", "--cached", "openspec/schemas/portable/schema.yaml"],
          { cwd: root },
        );
      },
    ],
    [
      "redirected target",
      async (root) => {
        const target = path.join(root, "openspec/schemas/portable");
        await rename(target, `${target}-real`);
        await symlink(`${target}-real`, target);
      },
    ],
    [
      "nested repository",
      async (root) => {
        execFileSync("git", ["init", "--quiet"], {
          cwd: path.join(root, "openspec/schemas/portable"),
        });
      },
    ],
    [
      "invalid history",
      async (root) => {
        const file = path.join(
          root,
          "openspec/changes/sample/.opsx-provenance.json",
        );
        const value = JSON.parse(await readFile(file, "utf8"));
        value.migrations = [
          {
            from: value.created,
            to: { ...value.created, name: "other" },
            at: "2026-10-07T00:00:00Z",
          },
        ];
        await writeFile(file, JSON.stringify(value));
      },
    ],
    [
      "bundle mismatch",
      async (root) => {
        const file = path.join(
          root,
          "openspec/changes/sample/.opsx-provenance.json",
        );
        const value = JSON.parse(await readFile(file, "utf8"));
        value.created.bundleSource = {
          name: "other",
          version: "1",
          revision: "1",
          digest: "a".repeat(64),
        };
        await writeFile(file, JSON.stringify(value));
      },
    ],
    [
      "unknown provenance",
      async (root) =>
        rm(path.join(root, "openspec/changes/sample/.opsx-provenance.json")),
    ],
  ];
  for (const [name, mutate] of scenarios) {
    const f = await linkedFixture(roots);
    await completeWorkflow(f.linked, f.change);
    await mutate(f.linked);
    const before = await treeBytes(f.linked);
    const response = cli(f.linked, "change", "re-pin", f.change, "portable");
    expect(response.code, `${name}: ${response.output}`).not.toBe(0);
    expect(JSON.parse(response.output).ok).toBe(false);
    expect(await treeBytes(f.linked)).toEqual(before);
  }
});
test("genuine same-name shadow remains blocking", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const dataHome = path.join(f.linked, "fixture-data");
  const shadow = path.join(dataHome, "openspec/schemas/portable");
  await mkdir(path.dirname(shadow), { recursive: true });
  await cp(path.join(f.linked, "openspec/schemas/portable"), shadow, {
    recursive: true,
  });
  const before = await treeBytes(f.linked);
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      path.resolve(import.meta.dir, "../../src/domain/cli.ts"),
      "--project",
      f.linked,
      "--json",
      "change",
      "re-pin",
      f.change,
      "portable",
    ],
    cwd: f.linked,
    env: { ...process.env, XDG_DATA_HOME: dataHome },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = new TextDecoder().decode(result.stdout);
  expect(result.exitCode, output).not.toBe(0);
  expect(JSON.parse(output).data.error.code).toBe("SCHEMA_AMBIGUOUS");
  expect(await treeBytes(f.linked)).toEqual(before);
});
test("incomplete switch journal blocks preview without writes", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const journalDirectory = path.join(f.linked, "openspec/.opsx");
  await writeFile(
    path.join(journalDirectory, "switch-journal.json"),
    JSON.stringify({
      version: 1,
      id: "fixture-switch",
      state: "partial",
      startedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
      root: f.linked,
      request: { schema: "portable", profiles: [], migrations: [] },
      previewToken: "fixture-token",
      oldDefault: "portable",
      targetDefault: "portable",
      actions: [
        {
          id: "fixture-action",
          kind: "migration.provenance",
          status: "running",
          targets: [
            path.join(
              f.linked,
              "openspec/changes/sample/.opsx-provenance.json",
            ),
          ],
          intent: "Pending fixture provenance change",
        },
      ],
    }),
  );
  const before = await treeBytes(f.linked);
  const response = cli(f.linked, "change", "re-pin", f.change, "portable");
  expect(response.code, response.output).not.toBe(0);
  expect(JSON.parse(response.output).data.error.code).toBe(
    "SWITCH_RECOVERY_REQUIRED",
  );
  expect(await treeBytes(f.linked)).toEqual(before);
});
test("ambiguous paired version-one association stays read-only", async () => {
  const f = await linkedFixture(roots, true);
  await completeWorkflow(f.linked, f.change);
  const file = path.join(
    f.linked,
    "openspec/changes/sample/.opsx-provenance.json",
  );
  const value = JSON.parse(await readFile(file, "utf8"));
  value.version = 1;
  delete value.establishments;
  value.migrations = [
    {
      from: value.created,
      to: value.created,
      at: "2026-10-07T00:00:00Z",
      associationBefore: value.association,
      associationAfter: value.association,
    },
  ];
  await writeFile(file, JSON.stringify(value));
  const before = await treeBytes(f.linked);
  const response = cli(
    f.linked,
    "change",
    "re-pin",
    f.change,
    "portable",
    "--bundle",
    "default",
    "--no-profiles",
  );
  expect(response.code, response.output).not.toBe(0);
  expect(JSON.parse(response.output).data.error.code).toBe(
    "PROVENANCE_ASSOCIATION_REVIEW_REQUIRED",
  );
  expect(await treeBytes(f.linked)).toEqual(before);
});
test("text CLI previews and reports refused options with nonzero status", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const file = path.join(
    f.linked,
    "openspec/changes/sample/.opsx-provenance.json",
  );
  const provenance = JSON.parse(await readFile(file, "utf8"));
  delete provenance.created.origin;
  await writeFile(file, JSON.stringify(provenance));
  const before = await treeBytes(f.linked);
  const run = (...args: string[]) =>
    Bun.spawnSync({
      cmd: [
        process.execPath,
        path.resolve(import.meta.dir, "../../src/domain/cli.ts"),
        "--project",
        f.linked,
        "change",
        "re-pin",
        f.change,
        "portable",
        ...args,
      ],
      cwd: f.linked,
      stdout: "pipe",
      stderr: "pipe",
    });
  const preview = run();
  expect(preview.exitCode).toBe(0);
  const text = new TextDecoder().decode(preview.stdout);
  expect(text).toContain("change.re-pin");
  expect(text).toContain(
    "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.",
  );
  expect(text).toContain(path.join(f.original, "openspec/schemas/portable"));
  expect(text).toContain(path.join(f.linked, "openspec/schemas/portable"));
  const refused = run("--recover");
  expect(refused.exitCode).not.toBe(0);
  expect(new TextDecoder().decode(refused.stdout)).toContain(
    "REPIN_NOT_IMPLEMENTED",
  );
  expect(await treeBytes(f.linked)).toEqual(before);
});
test("installed profile target permits a physical alias owner and rejects false ownership", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  const schemaRoot = path.join(f.linked, "openspec/schemas/portable");
  await writeFile(
    path.join(schemaRoot, "skills.txt"),
    "fixture/skills\t.agents/skills/guard-skill\n",
  );
  execFileSync("git", ["add", "openspec/schemas/portable/skills.txt"], {
    cwd: f.linked,
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
      "skills",
    ],
    { cwd: f.linked },
  );
  const revision = await resolveRevision(
    new OpenSpecClient(f.linked),
    "portable",
  );
  await retainRevision(f.linked, revision);
  const source = path.join(f.linked, "skill-source");
  await mkdir(path.join(source, ".agents/skills/guard-skill"), {
    recursive: true,
  });
  await writeFile(
    path.join(source, ".agents/skills/guard-skill/SKILL.md"),
    "---\nname: guard-skill\ndescription: Fixture.\n---\n\n# Guard\n",
  );
  const resourceOptions = { sourceRoots: { "fixture/skills": source } };
  const plan = await previewSkillInstall(
    {
      projectRoot: f.linked,
      schemaRoot,
      profiles: ["codex", "opencode"],
      skillHosts: [],
      skillBundle: "default",
    },
    resourceOptions,
  );
  expect(plan.targets[0]?.action).toBe("install");
  await applySkillInstall(plan, resourceOptions);
  const directory = await changeDirectory(f.linked, f.change);
  const provenancePath = path.join(directory, ".opsx-provenance.json");
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
  const associated = {
    version: 1,
    effectiveRevision: revisionRef(revision),
    profiles: ["codex"],
    skillHosts: [],
    skillBundle: "default",
    manifestDigests: plan.manifestDigests,
  };
  provenance.created = revisionRef(revision);
  provenance.association = associated;
  provenance.establishments = [
    { afterMigrationCount: 0, afterRePinCount: 0, association: associated },
  ];
  await writeFile(provenancePath, JSON.stringify(provenance));
  const review = () =>
    previewChangeRePin(
      f.linked,
      f.change,
      "portable",
      {
        profiles: ["codex"],
        noProfiles: false,
        skillHosts: [],
        bundle: "default",
      },
      undefined,
      resourceOptions,
    );
  const before = await treeBytes(f.linked);
  const positive = await review();
  expect(positive.ok, JSON.stringify(positive)).toBe(true);
  expect(await treeBytes(f.linked)).toEqual(before);
  const ownershipPath = path.join(
    f.linked,
    ".openspec/opsx-schema/managed-resources.json",
  );
  const originalOwnership = await readFile(ownershipPath, "utf8");
  for (const owners of [
    ["opencode"],
    ["codex", "cursor"],
    ["codex", "codex"],
  ]) {
    const edited = JSON.parse(originalOwnership);
    edited.resources[".agents/skills/guard-skill"].profiles = owners;
    await writeFile(ownershipPath, JSON.stringify(edited));
    const beforeRefusal = await treeBytes(f.linked);
    expect((await review()).ok).toBe(false);
    expect(await treeBytes(f.linked)).toEqual(beforeRefusal);
  }
  const wrongSource = JSON.parse(originalOwnership);
  wrongSource.resources[".agents/skills/guard-skill"].repository =
    "other/skills";
  await writeFile(ownershipPath, JSON.stringify(wrongSource));
  const beforeWrongSource = await treeBytes(f.linked);
  expect((await review()).ok).toBe(false);
  expect(await treeBytes(f.linked)).toEqual(beforeWrongSource);
  await writeFile(ownershipPath, originalOwnership);
  const selectedWrong = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    {
      profiles: ["opencode"],
      noProfiles: false,
      skillHosts: [],
      bundle: "default",
    },
    undefined,
    resourceOptions,
  );
  expect(selectedWrong.ok).toBe(false);
  const target = path.join(f.linked, ".agents/skills/guard-skill");
  await writeFile(path.join(target, "SKILL.md"), "edited\n");
  const beforeEdited = await treeBytes(f.linked);
  expect((await review()).ok).toBe(false);
  expect(await treeBytes(f.linked)).toEqual(beforeEdited);
  await rm(target, { recursive: true });
  const beforeMissing = await treeBytes(f.linked);
  expect((await review()).ok).toBe(false);
  expect(await treeBytes(f.linked)).toEqual(beforeMissing);
});
