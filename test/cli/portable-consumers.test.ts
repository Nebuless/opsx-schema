import { afterEach, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { archiveChange } from "../../src/cli/archive.ts";
import { previewSchemaHandoff } from "../../src/cli/handoff.ts";
import { verifiedPinOptions } from "../../src/domain/cli/skill-pins.ts";
import { detailedChange } from "../../src/domain/snapshot.ts";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import {
  effectiveRevision,
  readProvenance,
} from "../../src/provenance/index.ts";
import { validateChange } from "../../src/validation/index.ts";
import { linkedFixture, recordFinalRePin } from "./portable-fixture.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function invoke(root: string, ...words: string[]) {
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      path.resolve(import.meta.dir, "../../src/domain/cli.ts"),
      "--project",
      root,
      ...words,
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

test("linked origin remains usable by change, validation, skill pin, and handoff consumers after source removal", async () => {
  const fixture = await linkedFixture(roots);
  execFileSync("git", ["worktree", "remove", "--force", fixture.original], {
    cwd: fixture.linked,
  });
  const client = new OpenSpecClient(fixture.linked);

  const detailed = await detailedChange(fixture.linked, client, fixture.change);
  expect(detailed.revision).toMatchObject({
    state: "intact",
    source: fixture.current.source,
  });
  const validation = await validateChange(fixture.linked, fixture.change);
  expect(
    validation.findings.some((finding) =>
      finding.code.startsWith("SCHEMA_REVISION_"),
    ),
  ).toBe(false);
  expect(await verifiedPinOptions.resolveActivePins?.(fixture.linked)).toEqual(
    [],
  );
  const handoff = await previewSchemaHandoff(
    fixture.linked,
    fixture.change,
    "portable",
  );
  expect(handoff).toMatchObject({ ok: true, data: { noOp: true } });
  const json = invoke(fixture.linked, "--json", "changes", fixture.change);
  expect(json.code).toBe(0);
  expect(JSON.parse(json.output)).toMatchObject({
    ok: true,
    data: { revision: { state: "intact", source: fixture.current.source } },
  });
  const text = invoke(fixture.linked, "changes", fixture.change);
  expect(text.code).toBe(0);
  expect(text.output).toContain("intact");
});

test("associated pin reads resources from the verified current schema root", async () => {
  const fixture = await linkedFixture(roots, true);
  execFileSync("git", ["worktree", "remove", "--force", fixture.original], {
    cwd: fixture.linked,
  });
  const pins = await verifiedPinOptions.resolveActivePins?.(fixture.linked);
  expect(pins).toMatchObject([
    { change: "sample", schemaRoot: fixture.current.source },
  ]);
});

test("independent clone still refuses recorded origin without changing the receipt", async () => {
  const fixture = await linkedFixture(roots);
  const clone = path.join(path.dirname(fixture.linked), "clone");
  execFileSync("git", ["clone", "--quiet", fixture.linked, clone]);
  await cp(
    path.join(fixture.linked, "openspec", "changes"),
    path.join(clone, "openspec", "changes"),
    { recursive: true },
  );
  await cp(
    path.join(fixture.linked, "openspec", ".opsx"),
    path.join(clone, "openspec", ".opsx"),
    { recursive: true },
  );
  const file = path.join(
    clone,
    "openspec",
    "changes",
    fixture.change,
    ".opsx-provenance.json",
  );
  const before = await readFile(file);
  const result = invoke(clone, "--json", "change", "validate", fixture.change);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.output)).toMatchObject({
    ok: false,
    data: {
      data: {
        findings: expect.arrayContaining([
          expect.objectContaining({ code: "SCHEMA_REVISION_SHADOW" }),
        ]),
      },
    },
  });
  expect(await readFile(file)).toEqual(before);
});

test("consumers select the final effective re-pin rather than the prior migration", async () => {
  const fixture = await linkedFixture(roots);
  const { file, to } = await recordFinalRePin(fixture);
  const bytes = await readFile(file);

  const recorded = await readProvenance(path.dirname(file));
  if (!recorded) throw new Error("Missing recorded provenance");
  expect(effectiveRevision(recorded)).toEqual(to);
  const detailed = await detailedChange(
    fixture.linked,
    new OpenSpecClient(fixture.linked),
    fixture.change,
  );
  expect(detailed.revision).toMatchObject({
    state: "intact",
    source: to.source,
  });
  const validation = await validateChange(fixture.linked, fixture.change);
  expect(
    validation.findings.some((finding) =>
      finding.code.startsWith("SCHEMA_REVISION_"),
    ),
  ).toBe(false);
  expect(await verifiedPinOptions.resolveActivePins?.(fixture.linked)).toEqual(
    [],
  );
  expect(await readFile(file)).toEqual(bytes);
  const archive = await archiveChange(fixture.linked, fixture.change);
  expect(archive).toMatchObject({
    ok: true,
    phase: "preview",
    data: { currentRevision: to },
  });
});

test("archive apply accepts a relocated witnessed pin and retains exact history", async () => {
  const fixture = await linkedFixture(roots);
  await recordFinalRePin(fixture);
  const directory = path.join(
    fixture.linked,
    "openspec",
    "changes",
    fixture.change,
  );
  await writeFile(
    path.join(directory, "proposal.md"),
    "## Why\n\nVerify archive behavior.\n\n## What Changes\n\n- Preserve portable provenance.\n\n## Capabilities\n\n### New Capabilities\n\n- portable-proof: Verify archive.\n\n## Impact\n\nFixture only.\n",
  );
  await mkdir(path.join(directory, "specs", "portable-proof"), {
    recursive: true,
  });
  await writeFile(
    path.join(directory, "specs", "portable-proof", "spec.md"),
    "## ADDED Requirements\n\n### Requirement: Portable history is retained\nThe command SHALL preserve portable history.\n\n#### Scenario: Archive succeeds\n- **WHEN** a complete change is archived\n- **THEN** its history remains inspectable\n",
  );
  await writeFile(
    path.join(directory, "design.md"),
    "## Context\n\nFixture.\n\n## Goals / Non-Goals\n\n**Goals:** Verify archive.\n\n**Non-Goals:** Other behavior.\n\n## Decisions\n\nUse this fixture.\n\n## Risks / Trade-offs\n\nNone.\n",
  );
  await writeFile(
    path.join(directory, "tasks.md"),
    "## 1. Verify\n\n- [x] 1.1 Complete fixture.\n",
  );
  execFileSync("git", ["worktree", "remove", "--force", fixture.original], {
    cwd: fixture.linked,
  });
  const before = await readProvenance(directory);
  const beforeBytes = await readFile(
    path.join(directory, ".opsx-provenance.json"),
  );
  const preview = await archiveChange(fixture.linked, fixture.change);
  expect(preview).toMatchObject({ ok: true, phase: "preview" });
  if (!preview.ok || !preview.confirmation)
    throw new Error("Missing archive preview token");

  const applied = await archiveChange(fixture.linked, fixture.change, {
    applyToken: preview.confirmation.token,
  });
  expect(applied).toMatchObject({ ok: true, phase: "applied" });
  const archiveEntries = await (
    await import("../../src/archive/index.ts")
  ).listArchived(fixture.linked);
  expect(archiveEntries).toHaveLength(1);
  const archivedEntry = archiveEntries[0];
  if (!archivedEntry) throw new Error("Missing archived fixture");
  const archivedDirectory = path.join(
    fixture.linked,
    "openspec",
    "changes",
    "archive",
    archivedEntry.name,
  );
  const archived = await readProvenance(archivedDirectory);
  expect(archived).toEqual(before);
  expect(
    await readFile(path.join(archivedDirectory, ".opsx-provenance.json")),
  ).toEqual(beforeBytes);
});

test("archive refuses final digest drift with missing retention before writing", async () => {
  const fixture = await linkedFixture(roots);
  const directory = path.join(
    fixture.linked,
    "openspec",
    "changes",
    fixture.change,
  );
  const schemaFile = path.join(fixture.current.source, "schema.yaml");
  const revisions = path.join(
    fixture.linked,
    "openspec",
    ".opsx",
    "revisions",
    fixture.current.name,
  );
  const retained = path.join(revisions, fixture.current.digest);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const pin = path.join(directory, ".openspec.yaml");
  const config = path.join(fixture.linked, "openspec", "config.yaml");
  const receiptBytes = await readFile(receipt);
  const pinBytes = await readFile(pin);
  const configBytes = await readFile(config);
  const originalSchema = await readFile(schemaFile, "utf8");
  const injectedSchema = `${originalSchema}\n# changed at final archive guard\n`;
  const preview = await archiveChange(fixture.linked, fixture.change);
  expect(preview).toMatchObject({ ok: true, phase: "preview" });
  if (!preview.ok || !preview.confirmation)
    throw new Error("Missing archive preview token");

  const originalJson = OpenSpecClient.prototype.json.bind(
    new OpenSpecClient(fixture.linked),
  );
  let schemaLookups = 0;
  const finalSchemaLookupAfterPlanRecheck = 5;
  let injected = false;
  const json = spyOn(OpenSpecClient.prototype, "json").mockImplementation(
    async <T>(...args: string[]): Promise<T> => {
      const result = await originalJson<T>(...args);
      if (
        args[0] === "schema" &&
        args[1] === "which" &&
        args[2] === fixture.current.name
      ) {
        schemaLookups++;
        if (schemaLookups === finalSchemaLookupAfterPlanRecheck) {
          await writeFile(schemaFile, injectedSchema);
          await rm(retained, { recursive: true });
          injected = true;
        }
      }
      return result;
    },
  );
  let applied: Awaited<ReturnType<typeof archiveChange>>;
  try {
    applied = await archiveChange(fixture.linked, fixture.change, {
      applyToken: preview.confirmation.token,
    });
    expect(json.mock.calls.some(([command]) => command === "archive")).toBe(
      false,
    );
  } finally {
    json.mockRestore();
  }

  expect(injected).toBe(true);
  expect(await readFile(schemaFile, "utf8")).toBe(injectedSchema);
  expect(await readdir(revisions)).toEqual([]);
  expect(await readFile(receipt)).toEqual(receiptBytes);
  expect(await readFile(pin)).toEqual(pinBytes);
  expect(await readFile(config)).toEqual(configBytes);
  expect((await readdir(directory)).sort()).toEqual([
    ".openspec.yaml",
    ".opsx-provenance.json",
  ]);
  expect(applied).toMatchObject({
    ok: false,
    error: { code: "STALE_PREVIEW" },
  });
});
