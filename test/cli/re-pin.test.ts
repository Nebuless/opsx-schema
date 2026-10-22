import { afterEach, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import type { BigIntStats, PathLike, StatOptions, Stats } from "node:fs";
import { existsSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import {
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { changeDirectory } from "../../src/archive/index.ts";
import {
  applyChangeRePin,
  previewChangeRePin,
  previewChangeRePinRecovery,
  recoverChangeRePin,
} from "../../src/cli/repin.ts";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import { acquireProjectMutationLock } from "../../src/project-lock.ts";
import { recordCreation, revisionRef } from "../../src/provenance/index.ts";
import {
  applySkillInstall,
  previewSkillInstall,
} from "../../src/resources/index.ts";
import { resolveRevision, retainRevision } from "../../src/revisions/index.ts";
import {
  validateChange,
  validateChangeAgainst,
} from "../../src/validation/index.ts";
import { linkedFixture } from "./portable-fixture.ts";
import {
  apply as applySwitch,
  preview as previewSwitch,
  readSelectionReceipt,
} from "../../src/switch/index.ts";

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
  const applied = await applyChangeRePin({
    rootInput: f.linked,
    changeInput: f.change,
    schemaInput: "portable",
    selection: { profiles: [], noProfiles: false, skillHosts: [] },
  });
  expect(applied.ok).toBe(true);
  if (applied.ok) expect(applied.data.noOp).toBe(true);
  expect(await treeBytes(f.linked)).toEqual(before);
});

test("reviewed missing-origin re-pin applies one event and preserves unknown history", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const provenanceFile = path.join(directory, ".opsx-provenance.json");
  const provenance = JSON.parse(await readFile(provenanceFile, "utf8"));
  delete provenance.created.origin;
  provenance.created.source = path.join(
    path.dirname(f.linked),
    "vanished",
    "openspec/schemas/portable",
  );
  const historicalSource = provenance.created.source;
  await writeFile(provenanceFile, JSON.stringify(provenance));
  await chmod(provenanceFile, 0o640);

  const reviewed = cli(f.linked, "change", "re-pin", f.change, "portable");
  expect(reviewed.code, reviewed.output).toBe(0);
  const envelope = JSON.parse(reviewed.output);
  const preview = envelope.data.data;
  expect(preview.guardDigest).toBeUndefined();
  expect(preview.inputDigest).toBeUndefined();
  expect(preview.guardRoutes).toBeUndefined();
  const beforePin = await readFile(path.join(directory, ".openspec.yaml"));
  const beforeArtifacts = await treeBytes(directory);
  const missingConfirmation = cli(
    f.linked,
    "change",
    "re-pin",
    f.change,
    "portable",
    "--apply-token",
    envelope.data.confirmation.token,
  );
  expect(missingConfirmation.code).not.toBe(0);
  expect(JSON.parse(missingConfirmation.output).data.error.code).toBe(
    "REPIN_CONFIRMATION_REQUIRED",
  );
  const wrongConfirmation = cli(
    f.linked,
    "change",
    "re-pin",
    f.change,
    "portable",
    "--apply-token",
    envelope.data.confirmation.token,
    "--confirm",
    "The old location can be verified.",
  );
  expect(wrongConfirmation.code).not.toBe(0);
  expect(JSON.parse(wrongConfirmation.output).data.error.code).toBe(
    "REPIN_CONFIRMATION_MISMATCH",
  );
  const originalUmask = process.umask(0o077);
  const applied = cli(
    f.linked,
    "change",
    "re-pin",
    f.change,
    "portable",
    "--apply-token",
    envelope.data.confirmation.token,
    "--confirm",
    envelope.data.confirmation.exactTarget,
  );
  process.umask(originalUmask);
  expect(applied.code, applied.output).toBe(0);
  expect(JSON.parse(applied.output).data.phase).toBe("applied");

  const updated = JSON.parse(await readFile(provenanceFile, "utf8"));
  expect(updated.created.source).toBe(historicalSource);
  expect(updated.created.origin).toBeUndefined();
  expect(updated.rePins).toHaveLength(1);
  expect(updated.rePins[0]).toMatchObject({
    from: provenance.created,
    to: preview.to,
    associationBefore: null,
    associationAfter: null,
  });
  expect(updated.rePins[0].at).toEqual(expect.any(String));
  expect(await readFile(path.join(directory, ".openspec.yaml"))).toEqual(
    beforePin,
  );
  expect((await stat(provenanceFile)).mode & 0o777).toBe(0o640);
  expect(await treeBytes(directory)).not.toEqual(beforeArtifacts);
  const journal = JSON.parse(
    await readFile(
      path.join(f.linked, "openspec/.opsx/re-pin-journal.json"),
      "utf8",
    ),
  );
  expect(journal.state).toBe("complete");
  expect(journal.version).toBe(2);
  expect(
    (await stat(path.join(f.linked, "openspec/.opsx/re-pin-journal.json")))
      .mode & 0o777,
  ).toBe(0o600);
  expect(journal.expectedDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(journal.intendedDigest).toMatch(/^[a-f0-9]{64}$/);
  expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(
    false,
  );
  expect(
    (await readdir(path.join(f.linked, "openspec/.opsx"))).some((name) =>
      name.endsWith(".tmp"),
    ),
  ).toBe(false);
  journal.state = "partial";
  await writeFile(
    path.join(f.linked, "openspec/.opsx/re-pin-journal.json"),
    JSON.stringify(journal),
  );
  const receiptAfterApply = await readFile(provenanceFile);
  const unresolvedApply = cli(
    f.linked,
    "change",
    "re-pin",
    f.change,
    "portable",
    "--apply-token",
    envelope.data.confirmation.token,
    "--confirm",
    envelope.data.confirmation.exactTarget,
  );
  expect(unresolvedApply.code).not.toBe(0);
  expect(JSON.parse(unresolvedApply.output).data.error.code).toBe(
    "REPIN_RECOVERY_REQUIRED",
  );
  expect(await readFile(provenanceFile)).toEqual(receiptAfterApply);
}, 45000);

test("Apply rejects stale artifact, config, pin, and same-byte receipt replacements before journaling", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const original = JSON.parse(await readFile(receipt, "utf8"));
  delete original.created.origin;
  original.created.source = path.join(
    path.dirname(f.linked),
    "vanished",
    "openspec/schemas/portable",
  );
  await writeFile(receipt, JSON.stringify(original));
  const proposal = path.join(directory, "proposal.md");
  const originalProposal = await readFile(proposal);
  const config = path.join(f.linked, "openspec/config.yaml");
  const originalConfig = await readFile(config);
  const pin = path.join(directory, ".openspec.yaml");

  const applyReviewed = (review: { token: string; confirm: string }) =>
    cli(
      f.linked,
      "change",
      "re-pin",
      f.change,
      "portable",
      "--apply-token",
      review.token,
      "--confirm",
      review.confirm,
    );
  const getReview = () => {
    const result = cli(f.linked, "change", "re-pin", f.change, "portable");
    expect(result.code, result.output).toBe(0);
    const envelope = JSON.parse(result.output).data;
    return {
      token: envelope.confirmation.token as string,
      confirm: envelope.confirmation.exactTarget as string,
    };
  };
  const expectStaleWithoutJournal = (result: ReturnType<typeof cli>) => {
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.output).data.error.code).toBe("STALE_PREVIEW");
    expect(
      existsSync(path.join(f.linked, "openspec/.opsx/re-pin-journal.json")),
    ).toBe(false);
  };

  const artifactReview = getReview();
  await writeFile(
    proposal,
    Buffer.concat([originalProposal, Buffer.from("\nchanged\n")]),
  );
  expectStaleWithoutJournal(applyReviewed(artifactReview));
  await writeFile(proposal, originalProposal);

  const configReview = getReview();
  await writeFile(
    config,
    Buffer.concat([originalConfig, Buffer.from("\n# changed\n")]),
  );
  expectStaleWithoutJournal(applyReviewed(configReview));
  await writeFile(config, originalConfig);

  const pinReview = getReview();
  const pinBytes = await readFile(pin);
  const pinMode = (await stat(pin)).mode & 0o777;
  const pinStage = `${pin}.same-bytes`;
  await writeFile(pinStage, pinBytes, { mode: pinMode });
  await chmod(pinStage, pinMode);
  await rename(pinStage, pin);
  expectStaleWithoutJournal(applyReviewed(pinReview));

  const receiptReview = getReview();
  const receiptBytes = await readFile(receipt);
  const receiptMode = (await stat(receipt)).mode & 0o777;
  const receiptStage = `${receipt}.same-bytes`;
  await writeFile(receiptStage, receiptBytes, { mode: receiptMode });
  await chmod(receiptStage, receiptMode);
  await rename(receiptStage, receipt);
  const unchangedExternalBytes = await readFile(receipt);
  expectStaleWithoutJournal(applyReviewed(receiptReview));
  expect(await readFile(receipt)).toEqual(unchangedExternalBytes);
}, 45000);

test("Postflight failure retains external edits and a partial journal after receipt activation", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const original = JSON.parse(await readFile(receipt, "utf8"));
  delete original.created.origin;
  original.created.source = path.join(
    path.dirname(f.linked),
    "vanished",
    "openspec/schemas/portable",
  );
  await writeFile(receipt, JSON.stringify(original));
  const priorReceipt = await readFile(receipt);
  const config = path.join(f.linked, "openspec/config.yaml");
  const priorConfig = await readFile(config);
  const externalConfig = Buffer.concat([
    priorConfig,
    Buffer.from("\n# concurrent edit\n"),
  ]);
  const review = await previewChangeRePin(f.linked, f.change, "portable", {
    profiles: [],
    noProfiles: false,
    skillHosts: [],
  });
  expect(review.ok).toBe(true);
  if (!review.ok || !review.confirmation) return;

  let preservedExternalEdit = false;
  const originalCommandResult = OpenSpecClient.prototype.commandResult;
  const validation = spyOn(
    OpenSpecClient.prototype,
    "commandResult",
  ).mockImplementation(async function (
    this: OpenSpecClient,
    ..._args: string[]
  ) {
    if (
      this.projectRoot === f.linked &&
      !preservedExternalEdit &&
      !(await readFile(receipt)).equals(priorReceipt)
    ) {
      await writeFile(config, externalConfig);
      preservedExternalEdit = true;
    }
    return originalCommandResult.apply(this, _args);
  });
  try {
    const result = await applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      applyToken: review.confirmation.token,
      confirmationText: review.confirmation.exactTarget,
      selection: { profiles: [], noProfiles: false, skillHosts: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("REPIN_POSTFLIGHT");
  } finally {
    validation.mockRestore();
  }

  expect(preservedExternalEdit).toBe(true);
  expect(await readFile(config)).toEqual(externalConfig);
  const activatedReceipt = JSON.parse(await readFile(receipt, "utf8"));
  expect(activatedReceipt.rePins).toHaveLength(1);
  const journal = JSON.parse(
    await readFile(
      path.join(f.linked, "openspec/.opsx/re-pin-journal.json"),
      "utf8",
    ),
  );
  expect(journal.state).toBe("partial");
  expect(journal.error).toContain("postflight");
  expect(journal.expectedDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(journal.intendedDigest).toMatch(/^[a-f0-9]{64}$/);
});

test("Apply refuses a redirected change ancestor without replacing the receipt", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const value = JSON.parse(await readFile(receipt, "utf8"));
  delete value.created.origin;
  value.created.source = path.join(
    path.dirname(f.linked),
    "vanished",
    "openspec/schemas/portable",
  );
  await writeFile(receipt, JSON.stringify(value));
  const selected = { profiles: [], noProfiles: false, skillHosts: [] };
  const review = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    selected,
  );
  expect(review.ok).toBe(true);
  if (!review.ok) return;
  const before = await readFile(receipt);
  const changes = path.join(f.linked, "openspec/changes");
  const savedChanges = `${changes}.saved`;
  await rename(changes, savedChanges);
  await symlink(os.tmpdir(), changes);
  try {
    const result = await applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      applyToken: review.confirmation?.token,
      confirmationText: review.confirmation?.exactTarget,
      selection: selected,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSAFE_PATH");
    expect(
      existsSync(path.join(f.linked, "openspec/.opsx/re-pin-journal.json")),
    ).toBe(false);
  } finally {
    await rm(changes);
    await rename(savedChanges, changes);
  }
  expect(await readFile(receipt)).toEqual(before);
});

test("Apply preserves an unrelated redirected journal stage", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const value = JSON.parse(await readFile(receipt, "utf8"));
  delete value.created.origin;
  value.created.source = path.join(
    path.dirname(f.linked),
    "vanished",
    "openspec/schemas/portable",
  );
  await writeFile(receipt, JSON.stringify(value));
  const selected = { profiles: [], noProfiles: false, skillHosts: [] };
  const review = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    selected,
  );
  expect(review.ok).toBe(true);
  if (!review.ok || !review.confirmation) return;
  const fixedId = "00000000-0000-4000-8000-000000000001";
  const stage = path.join(
    f.linked,
    `openspec/.opsx/.re-pin-journal.json.${fixedId}.tmp`,
  );
  await symlink(os.tmpdir(), stage);
  const before = await readFile(receipt);
  const uuidSpy = spyOn(
    await import("node:crypto"),
    "randomUUID",
  ).mockReturnValue(fixedId);
  try {
    const result = await applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      applyToken: review.confirmation.token,
      confirmationText: review.confirmation.exactTarget,
      selection: selected,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("REPIN_STAGE_CONFLICT");
    expect(await readFile(receipt)).toEqual(before);
    expect(
      existsSync(path.join(f.linked, "openspec/.opsx/re-pin-journal.json")),
    ).toBe(false);
    expect(await readlink(stage)).toBe(os.tmpdir());
  } finally {
    uuidSpy.mockRestore();
    await rm(stage);
  }
});

test("Apply shares the project mutation lock and refuses concurrent mutation", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const value = JSON.parse(await readFile(receipt, "utf8"));
  delete value.created.origin;
  value.created.source = path.join(
    path.dirname(f.linked),
    "vanished",
    "openspec/schemas/portable",
  );
  await writeFile(receipt, JSON.stringify(value));
  const selected = { profiles: [], noProfiles: false, skillHosts: [] };
  const review = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    selected,
  );
  expect(review.ok).toBe(true);
  if (!review.ok || !review.confirmation) return;
  const before = await readFile(receipt);
  const release = await acquireProjectMutationLock(f.linked);
  try {
    const result = await applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      applyToken: review.confirmation.token,
      confirmationText: review.confirmation.exactTarget,
      selection: selected,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROJECT_LOCKED");
    expect(await readFile(receipt)).toEqual(before);
    expect(
      existsSync(path.join(f.linked, "openspec/.opsx/re-pin-journal.json")),
    ).toBe(false);
  } finally {
    await release();
  }
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
test("ordinary Apply tokens and recovery without a journal are refused", async () => {
  const f = await linkedFixture(roots);
  const before = await treeBytes(f.linked);
  for (const flags of [
    ["--apply-token", "fake"],
    ["--apply-token", ""],
    ["--apply-token", "fake", "--recover"],
    ["--recover"],
    ["--recovery-token", "fake"],
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
    const envelope = JSON.parse(response.output);
    expect(envelope.ok).toBe(false);
    if (flags.includes("--recover"))
      expect(envelope.error.code).toBe(
        flags.includes("--apply-token") ? "USAGE" : "REPIN_RECOVERY_NOT_FOUND",
      );
    if (flags.includes("--recovery-token"))
      expect(envelope.error.code).toBe("USAGE");
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

test("associated explicit empty selection applies without resource writes", async () => {
  const f = await linkedFixture(roots, true);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const provenance = JSON.parse(await readFile(receipt, "utf8"));
  const unknown = {
    ...provenance.created,
    source: path.join(
      path.dirname(f.linked),
      "vanished/openspec/schemas/portable",
    ),
  };
  delete unknown.origin;
  provenance.created = unknown;
  provenance.association.effectiveRevision = unknown;
  provenance.establishments[0].association.effectiveRevision = unknown;
  await writeFile(receipt, JSON.stringify(provenance));
  const selection = {
    profiles: [],
    noProfiles: true,
    skillHosts: [],
    bundle: "default" as const,
  };
  const review = await previewChangeRePin(
    f.linked,
    f.change,
    "portable",
    selection,
  );
  expect(review.ok, JSON.stringify(review)).toBe(true);
  if (!review.ok || !review.confirmation) return;
  const beforePin = await readFile(path.join(directory, ".openspec.yaml"));
  const beforeSchema = await treeBytes(
    path.join(f.linked, "openspec/schemas/portable"),
  );
  const result = await applyChangeRePin({
    rootInput: f.linked,
    changeInput: f.change,
    schemaInput: "portable",
    applyToken: review.confirmation.token,
    confirmationText: review.confirmation.exactTarget,
    selection,
  });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  const after = JSON.parse(await readFile(receipt, "utf8"));
  expect(after.rePins).toHaveLength(1);
  expect(after.created).toEqual(unknown);
  expect(after.rePins[0].associationAfter.profiles).toEqual([]);
  expect(await readFile(path.join(directory, ".openspec.yaml"))).toEqual(
    beforePin,
  );
  expect(
    await treeBytes(path.join(f.linked, "openspec/schemas/portable")),
  ).toEqual(beforeSchema);
}, 30000);
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
}, 45000);
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
    "REPIN_RECOVERY_NOT_FOUND",
  );
  expect(await treeBytes(f.linked)).toEqual(before);
});
test(
  "default install followed by OpenCode selection records ownership accepted by re-pin",
  async () => {
    const f = await linkedFixture(roots);
    await rm(await changeDirectory(f.linked, f.change), { recursive: true });
    const schemaRoot = path.join(f.linked, "openspec/schemas/portable");
    const declaration = "fixture/skills\t.agents/skills/guard-skill\n";
    await writeFile(path.join(schemaRoot, "skills.txt"), declaration);
    await writeFile(path.join(schemaRoot, "required-skills.txt"), declaration);
    execFileSync("git", ["add", "openspec/schemas/portable"], {
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
        "required skill fixture",
      ],
      { cwd: f.linked },
    );
    const source = path.join(f.linked, "skill-source");
    await mkdir(path.join(source, ".agents/skills/guard-skill"), {
      recursive: true,
    });
    await writeFile(
      path.join(source, ".agents/skills/guard-skill/SKILL.md"),
      "# Guard\n",
    );
    const options = { sourceRoots: { "fixture/skills": source } };
    const defaults = await previewSkillInstall(
      { projectRoot: f.linked, schemaRoot, profiles: [] },
      options,
    );
    expect(
      (await applySkillInstall(defaults, options)).installedTargets,
    ).toEqual([".agents/skills/guard-skill"]);
    const skill = path.join(f.linked, ".agents/skills/guard-skill/SKILL.md");
    const ownership = path.join(
      f.linked,
      ".openspec/opsx-schema/managed-resources.json",
    );
    const before = await Promise.all([stat(skill), stat(ownership)]);
    const raw = await readFile(ownership, "utf8");
    const request = {
      schema: "portable",
      profiles: ["opencode"],
      migrations: [],
      skillBundle: "default" as const,
    };
    const preview = await previewSwitch(f.linked, request, options);
    expect(preview.canApply, JSON.stringify(preview.diagnostics)).toBe(true);
    expect(preview.profiles.targets.map((target) => target.action)).toEqual([
      "noop",
    ]);
    const switched = await applySwitch(
      f.linked,
      request,
      preview.token,
      options,
    );
    expect(switched.status, JSON.stringify(switched)).toBe("applied");
    expect(
      switched.journal?.actions.filter(
        (action) => action.kind === "skills.install",
      ),
    ).toEqual([]);
    const association = await readSelectionReceipt(f.linked);
    if (!association) throw new Error("Expected a recorded OpenCode selection");
    expect(association.profiles).toEqual(["opencode"]);
    const revision = await resolveRevision(
      new OpenSpecClient(f.linked),
      "portable",
    );
    await retainRevision(f.linked, revision);
    const directory = path.join(f.linked, "openspec/changes", f.change);
    await mkdir(directory);
    await writeFile(
      path.join(directory, ".openspec.yaml"),
      "schema: portable\n",
    );
    await recordCreation(
      f.linked,
      f.change,
      revisionRef(revision),
      association,
    );
    await completeWorkflow(f.linked, f.change);
    const review = await previewChangeRePin(
      f.linked,
      f.change,
      "portable",
      {
        profiles: ["opencode"],
        noProfiles: false,
        skillHosts: [],
        bundle: "default",
      },
      options,
    );
    expect(review.ok, JSON.stringify(review)).toBe(true);
    expect(await readFile(skill, "utf8")).toBe("# Guard\n");
    expect(await readFile(ownership, "utf8")).toBe(raw);
    const after = await Promise.all([stat(skill), stat(ownership)]);
    expect(after.map((info) => [info.dev, info.ino, info.mtimeMs])).toEqual(
      before.map((info) => [info.dev, info.ino, info.mtimeMs]),
    );
  },
  { timeout: 30_000 },
);

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
    resourceOptions,
  );
  expect(selectedWrong.ok).toBe(false);
  const target = path.join(f.linked, ".agents/skills/guard-skill");
  const installedSkill = await readFile(path.join(target, "SKILL.md"));
  await writeFile(path.join(target, "SKILL.md"), "edited\n");
  const beforeEdited = await treeBytes(f.linked);
  expect((await review()).ok).toBe(false);
  expect(await treeBytes(f.linked)).toEqual(beforeEdited);
  await rm(target, { recursive: true });
  const beforeMissing = await treeBytes(f.linked);
  expect((await review()).ok).toBe(false);
  expect(await treeBytes(f.linked)).toEqual(beforeMissing);
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "SKILL.md"), installedSkill);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const unknown = {
    ...provenance.created,
    source: path.join(
      path.dirname(f.linked),
      "vanished/openspec/schemas/portable",
    ),
  };
  delete unknown.origin;
  provenance.created = unknown;
  provenance.association.effectiveRevision = unknown;
  provenance.establishments[0].association.effectiveRevision = unknown;
  await writeFile(provenancePath, JSON.stringify(provenance));
  const selection = {
    profiles: ["codex"],
    noProfiles: false,
    skillHosts: [],
    bundle: "default" as const,
  };
  const apply = (token: string, exactTarget: string) =>
    applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      applyToken: token,
      confirmationText: exactTarget,
      selection,
      resourceOptions,
    });
  const ready = await review();
  expect(ready.ok, JSON.stringify(ready)).toBe(true);
  if (!ready.ok || !ready.confirmation) return;
  const priorReceipt = await readFile(provenancePath);
  await writeFile(path.join(target, "SKILL.md"), "edited\n");
  expect(
    (await apply(ready.confirmation.token, ready.confirmation.exactTarget)).ok,
  ).toBe(false);
  expect(await readFile(provenancePath)).toEqual(priorReceipt);
  await writeFile(path.join(target, "SKILL.md"), installedSkill);
  const alteredOwnership = JSON.parse(originalOwnership);
  alteredOwnership.resources[".agents/skills/guard-skill"].repository =
    "other/skills";
  await writeFile(ownershipPath, JSON.stringify(alteredOwnership));
  expect(
    (await apply(ready.confirmation.token, ready.confirmation.exactTarget)).ok,
  ).toBe(false);
  expect(await readFile(provenancePath)).toEqual(priorReceipt);
  await writeFile(ownershipPath, originalOwnership);
  const fresh = await review();
  expect(fresh.ok, JSON.stringify(fresh)).toBe(true);
  if (!fresh.ok || !fresh.confirmation) return;
  const beforePin = await readFile(path.join(directory, ".openspec.yaml"));
  const beforeSchema = await treeBytes(schemaRoot);
  const originalRename = fsPromises.rename;
  let interrupted = false;
  const renameSpy = spyOn(fsPromises, "rename").mockImplementation(
    async (source, destination) => {
      if (!interrupted && String(destination) === provenancePath) {
        interrupted = true;
        throw new Error(
          "simulated interruption before associated receipt activation",
        );
      }
      return originalRename(source, destination);
    },
  );
  try {
    const applyAttempt = await apply(
      fresh.confirmation.token,
      fresh.confirmation.exactTarget,
    );
    expect(applyAttempt.ok).toBe(false);
  } finally {
    renameSpy.mockRestore();
  }
  expect(interrupted).toBe(true);
  const recoveryReview = await previewChangeRePinRecovery(
    f.linked,
    f.change,
    "portable",
    resourceOptions,
  );
  expect(recoveryReview.ok, JSON.stringify(recoveryReview)).toBe(true);
  if (!recoveryReview.ok || !recoveryReview.confirmation) return;
  const recovered = await recoverChangeRePin({
    rootInput: f.linked,
    changeInput: f.change,
    schemaInput: "portable",
    recoveryToken: recoveryReview.confirmation.token,
    confirmationText: recoveryReview.confirmation.exactTarget,
    resourceOptions,
  });
  expect(recovered.ok, JSON.stringify(recovered)).toBe(true);
  const updated = JSON.parse(await readFile(provenancePath, "utf8"));
  expect(updated.rePins).toHaveLength(1);
  expect(updated.created).toEqual(unknown);
  expect(await readFile(path.join(target, "SKILL.md"))).toEqual(installedSkill);
  expect(await readFile(ownershipPath, "utf8")).toBe(originalOwnership);
  expect(await readFile(path.join(directory, ".openspec.yaml"))).toEqual(
    beforePin,
  );
  expect(await treeBytes(schemaRoot)).toEqual(beforeSchema);
}, 90000);

async function reviewedApplyFixture() {
  const fixture = await linkedFixture(roots);
  await completeWorkflow(fixture.linked, fixture.change);
  execFileSync("git", ["worktree", "remove", "--force", fixture.original], {
    cwd: fixture.linked,
  });
  const directory = await changeDirectory(fixture.linked, fixture.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const value = JSON.parse(await readFile(receipt, "utf8"));
  delete value.created.origin;
  value.created.source = path.join(
    path.dirname(fixture.linked),
    "vanished/openspec/schemas/portable",
  );
  await writeFile(receipt, JSON.stringify(value));
  const selection = { profiles: [], noProfiles: false, skillHosts: [] };
  const review = await previewChangeRePin(
    fixture.linked,
    fixture.change,
    "portable",
    selection,
  );
  if (!review.ok || !review.confirmation)
    throw new Error(`Expected a ready re-pin: ${JSON.stringify(review)}`);
  const confirmed = review.confirmation;
  const journal = path.join(
    fixture.linked,
    "openspec/.opsx/re-pin-journal.json",
  );
  const config = path.join(fixture.linked, "openspec/config.yaml");
  const apply = () =>
    applyChangeRePin({
      rootInput: fixture.linked,
      changeInput: fixture.change,
      schemaInput: "portable",
      applyToken: confirmed.token,
      confirmationText: confirmed.exactTarget,
      selection,
    });
  return { fixture, receipt, journal, config, apply };
}

for (const boundary of ["receipt", "completion"] as const) {
  test(`Apply catches config edits during ${boundary} stage sync`, async () => {
    const f = await reviewedApplyFixture();
    const originalReceipt = await readFile(f.receipt);
    const originalMode = (await stat(f.receipt)).mode & 0o777;
    const originalOpen = fsPromises.open;
    let changed = false;
    const openSpy = spyOn(fsPromises, "open").mockImplementation(
      async (...args: Parameters<typeof fsPromises.open>) => {
        const handle = await originalOpen(...args);
        const file = String(args[0]);
        if (
          file.startsWith(path.dirname(f.journal)) &&
          ((boundary === "receipt" &&
            file.includes(".opsx-provenance.json.")) ||
            (boundary === "completion" &&
              file.includes(".re-pin-journal.json.")))
        ) {
          const originalSync = handle.sync.bind(handle);
          spyOn(handle, "sync").mockImplementation(async () => {
            await originalSync();
            if (
              !changed &&
              (boundary === "receipt" ||
                !(await fsPromises.readFile(f.receipt)).equals(originalReceipt))
            ) {
              await fsPromises.appendFile(
                f.config,
                "# changed during stage sync\n",
              );
              changed = true;
            }
          });
        }
        return handle;
      },
    );
    let result;
    try {
      result = await f.apply();
    } finally {
      openSpy.mockRestore();
    }
    expect(changed).toBe(true);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toMatch(/STALE_PREVIEW|REPIN_POSTFLIGHT/);
    const journal = JSON.parse(await readFile(f.journal, "utf8"));
    expect(journal.state).toBe("partial");
    if (boundary === "receipt") {
      expect(await readFile(f.receipt)).toEqual(originalReceipt);
      expect((await stat(f.receipt)).mode & 0o777).toBe(originalMode);
    } else {
      expect(JSON.parse(await readFile(f.receipt, "utf8")).rePins).toHaveLength(
        1,
      );
    }
  }, 30000);
}

for (const input of ["artifact", "resource", "route"] as const) {
  test(`Apply leaves receipt untouched for ${input} edits during receipt stage sync`, async () => {
    const f = await reviewedApplyFixture();
    const originalReceipt = await readFile(f.receipt);
    const originalMode = (await stat(f.receipt)).mode & 0o777;
    const artifact = path.join(path.dirname(f.receipt), "proposal.md");
    const resource = path.join(
      f.fixture.linked,
      "openspec/schemas/portable/skills.txt",
    );
    const route = path.join(f.fixture.linked, "openspec/schemas");
    const originalOpen = fsPromises.open;
    let changed = false;
    const openSpy = spyOn(fsPromises, "open").mockImplementation(
      async (...args: Parameters<typeof fsPromises.open>) => {
        const handle = await originalOpen(...args);
        const file = String(args[0]);
        if (
          file.startsWith(path.dirname(f.journal)) &&
          file.includes(".opsx-provenance.json.")
        ) {
          const originalSync = handle.sync.bind(handle);
          spyOn(handle, "sync").mockImplementation(async () => {
            await originalSync();
            if (changed) return;
            changed = true;
            if (input === "route") await chmod(route, 0o700);
            else
              await fsPromises.appendFile(
                input === "artifact" ? artifact : resource,
                "\n# edited during receipt staging\n",
              );
          });
        }
        return handle;
      },
    );
    let result;
    try {
      result = await f.apply();
    } finally {
      openSpy.mockRestore();
    }
    expect(changed).toBe(true);
    expect(result.ok).toBe(false);
    expect(await readFile(f.receipt)).toEqual(originalReceipt);
    expect((await stat(f.receipt)).mode & 0o777).toBe(originalMode);
    const journal = JSON.parse(await readFile(f.journal, "utf8"));
    expect(["prepared", "partial"]).toContain(journal.state);
    if (input === "route") expect((await stat(route)).mode & 0o777).toBe(0o700);
    else
      expect(
        await readFile(input === "artifact" ? artifact : resource, "utf8"),
      ).toContain("# edited during receipt staging");
  }, 30000);
}

for (const input of [
  "config",
  "artifact",
  "schema",
  "resource",
  "route",
] as const) {
  for (const boundary of ["stage-sync", "activation", "parent-sync"] as const) {
    if (input === "config" && boundary === "stage-sync") continue;
    test(`Apply observes ${input} edits at completion ${boundary}`, async () => {
      const f = await reviewedApplyFixture();
      const originalReceipt = await readFile(f.receipt);
      const artifact = path.join(path.dirname(f.receipt), "proposal.md");
      const schema = path.join(
        f.fixture.linked,
        "openspec/schemas/portable/schema.yaml",
      );
      const resource = path.join(
        f.fixture.linked,
        "openspec/schemas/portable/skills.txt",
      );
      const route = path.join(f.fixture.linked, "openspec/schemas");
      let changed = false;
      const mutate = async () => {
        if (changed) return;
        changed = true;
        if (input === "route") await chmod(route, 0o700);
        else
          await fsPromises.appendFile(
            {
              config: f.config,
              artifact,
              schema,
              resource,
            }[input],
            "\n# changed during completion\n",
          );
      };
      const originalOpen = fsPromises.open;
      const originalRename = fsPromises.rename;
      const openSpy = spyOn(fsPromises, "open").mockImplementation(
        async (...args: Parameters<typeof fsPromises.open>) => {
          const handle = await originalOpen(...args);
          const file = String(args[0]);
          if (
            boundary === "stage-sync" &&
            file.startsWith(path.dirname(f.journal)) &&
            file.includes(".re-pin-journal.json.")
          ) {
            const originalSync = handle.sync.bind(handle);
            spyOn(handle, "sync").mockImplementation(async () => {
              await originalSync();
              if (!(await readFile(f.receipt)).equals(originalReceipt))
                await mutate();
            });
          }
          if (boundary === "parent-sync" && file === path.dirname(f.journal)) {
            const originalSync = handle.sync.bind(handle);
            spyOn(handle, "sync").mockImplementation(async () => {
              await originalSync();
              const state = JSON.parse(await readFile(f.journal, "utf8")).state;
              if (state === "complete") await mutate();
            });
          }
          return handle;
        },
      );
      const renameSpy = spyOn(fsPromises, "rename").mockImplementation(
        async (...args: Parameters<typeof fsPromises.rename>) => {
          if (
            boundary === "activation" &&
            args[1] === f.journal &&
            !(await readFile(f.receipt)).equals(originalReceipt)
          )
            await mutate();
          return originalRename(...args);
        },
      );
      let result;
      try {
        result = await f.apply();
      } finally {
        openSpy.mockRestore();
        renameSpy.mockRestore();
      }
      expect(changed).toBe(true);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error.code).toMatch(
          /REPIN_POSTFLIGHT|REPIN_ROUTE_CHANGED/,
        );
      expect(JSON.parse(await readFile(f.receipt, "utf8")).rePins).toHaveLength(
        1,
      );
      const journal = JSON.parse(await readFile(f.journal, "utf8"));
      expect(["prepared", "partial", "complete"]).toContain(journal.state);
      if (input === "route")
        expect((await stat(route)).mode & 0o777).toBe(0o700);
      else
        expect(
          await readFile(
            { config: f.config, artifact, schema, resource }[input],
            "utf8",
          ),
        ).toContain("# changed during completion");
    }, 30000);
  }
}

for (const version of [1, 2] as const) {
  for (const state of ["prepared", "partial", "complete"] as const) {
    test(`Apply handles version ${version} ${state} journal without guessing recovery`, async () => {
      const f = await reviewedApplyFixture();
      const originalReceipt = await readFile(f.receipt);
      const first = await f.apply();
      expect(first.ok).toBe(true);
      const journal = JSON.parse(await readFile(f.journal, "utf8"));
      expect(journal.version).toBe(2);
      expect(journal.state).toBe("complete");
      expect(journal.expected.bytes).toBe(originalReceipt.toString("base64"));
      expect(Buffer.from(journal.intended, "base64")).toEqual(
        await readFile(f.receipt),
      );
      journal.version = version;
      journal.state = state;
      await writeFile(f.journal, JSON.stringify(journal));
      const intendedReceipt = await readFile(f.receipt);
      const result = await f.apply();
      expect(result.ok).toBe(false);
      if (state === "complete") {
        if (!result.ok) expect(result.error.code).toBe("STALE_PREVIEW");
      } else {
        if (!result.ok)
          expect(result.error.code).toBe("REPIN_RECOVERY_REQUIRED");
        const noToken = await applyChangeRePin({
          rootInput: f.fixture.linked,
          changeInput: "sample",
          schemaInput: "portable",
          selection: { profiles: [], noProfiles: false, skillHosts: [] },
        });
        expect(noToken.ok).toBe(false);
        if (!noToken.ok)
          expect(noToken.error.code).toBe("REPIN_RECOVERY_REQUIRED");
      }
      expect(await readFile(f.receipt)).toEqual(intendedReceipt);
    }, 45000);
  }
}

for (const version of [1, 2] as const) {
  test(`public preview accepts a completed version ${version} journal`, async () => {
    const f = await reviewedApplyFixture();
    expect((await f.apply()).ok).toBe(true);
    const complete = JSON.parse(await readFile(f.journal, "utf8"));
    if (version === 1)
      await writeFile(
        f.journal,
        JSON.stringify({
          version,
          state: "complete",
          operationId: complete.operationId,
        }),
      );
    const journalBytes = await readFile(f.journal);
    const preview = await previewChangeRePin(
      f.fixture.linked,
      "sample",
      "portable",
      { profiles: [], noProfiles: false, skillHosts: [] },
    );
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.data.noOp).toBe(true);
    expect(await readFile(f.journal)).toEqual(journalBytes);
  }, 45000);
}

test("Apply refuses a malformed version-two intent without touching the receipt", async () => {
  const f = await reviewedApplyFixture();
  const originalReceipt = await readFile(f.receipt);
  expect((await f.apply()).ok).toBe(true);
  const journal = JSON.parse(await readFile(f.journal, "utf8"));
  journal.expected.bytes = Buffer.from("foreign receipt").toString("base64");
  await writeFile(f.journal, JSON.stringify(journal));
  await writeFile(f.receipt, originalReceipt);
  const selection = { profiles: [], noProfiles: false, skillHosts: [] };
  const review = await previewChangeRePin(
    f.fixture.linked,
    "sample",
    "portable",
    selection,
  );
  expect(review.ok).toBe(false);
  if (!review.ok) expect(review.error.code).toBe("REPIN_JOURNAL_INVALID");
  await writeFile(
    f.journal,
    JSON.stringify({
      ...journal,
      expected: {
        ...journal.expected,
        bytes: originalReceipt.toString("base64"),
      },
    }),
  );
  const fresh = await previewChangeRePin(
    f.fixture.linked,
    "sample",
    "portable",
    selection,
  );
  expect(fresh.ok).toBe(true);
  if (!fresh.ok || !fresh.confirmation) return;
  await writeFile(f.journal, JSON.stringify(journal));
  const result = await applyChangeRePin({
    rootInput: f.fixture.linked,
    changeInput: "sample",
    schemaInput: "portable",
    applyToken: fresh.confirmation.token,
    confirmationText: fresh.confirmation.exactTarget,
    selection,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("REPIN_JOURNAL_INVALID");
  expect(await readFile(f.receipt)).toEqual(originalReceipt);
}, 45000);

for (const version of [1, 2] as const) {
  for (const state of ["prepared", "partial"] as const) {
    test(`public preview refuses version ${version} ${state} journal without writes`, async () => {
      const f = await reviewedApplyFixture();
      const before = await readFile(f.receipt);
      if (version === 2) {
        expect((await f.apply()).ok).toBe(true);
        const complete = JSON.parse(await readFile(f.journal, "utf8"));
        complete.state = state;
        await writeFile(f.journal, JSON.stringify(complete));
      } else {
        await writeFile(
          f.journal,
          JSON.stringify({ version, state, operationId: "pending-review" }),
        );
      }
      const receipt = await readFile(f.receipt);
      const journalBytes = await readFile(f.journal);
      const result = await previewChangeRePin(
        f.fixture.linked,
        "sample",
        "portable",
        { profiles: [], noProfiles: false, skillHosts: [] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("REPIN_RECOVERY_REQUIRED");
      if (version === 1) {
        const recovery = cli(
          f.fixture.linked,
          "change",
          "re-pin",
          "sample",
          "portable",
          "--recover",
        );
        expect(recovery.code).not.toBe(0);
        const recoveryEnvelope = JSON.parse(recovery.output);
        expect(recoveryEnvelope.data.error.code).toBe(
          "REPIN_RECOVERY_LEGACY_UNSUPPORTED",
        );
      }
      expect(await readFile(f.receipt)).toEqual(receipt);
      expect(await readFile(f.journal)).toEqual(journalBytes);
      if (version === 1) expect(receipt).toEqual(before);
    }, 30000);
  }
}

test("no-token healthy Apply refuses a held project lock", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const release = await acquireProjectMutationLock(f.linked);
  try {
    const result = await applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      selection: { profiles: [], noProfiles: false, skillHosts: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PROJECT_LOCKED");
  } finally {
    await release();
  }
}, 30000);

test("no-token Apply refuses a journal created during its no-op preview", async () => {
  const f = await linkedFixture(roots);
  await completeWorkflow(f.linked, f.change);
  execFileSync("git", ["worktree", "remove", "--force", f.original], {
    cwd: f.linked,
  });
  const directory = await changeDirectory(f.linked, f.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const before = await readFile(receipt);
  const journal = path.join(f.linked, "openspec/.opsx/re-pin-journal.json");
  const originalLstat = fsPromises.lstat;
  let missingReads = 0;
  async function watchedLstat(
    pathInput: PathLike,
    options?: StatOptions & { bigint?: false },
  ): Promise<Stats>;
  async function watchedLstat(
    pathInput: PathLike,
    options: StatOptions & { bigint: true },
  ): Promise<BigIntStats>;
  async function watchedLstat(
    pathInput: PathLike,
    options?: StatOptions,
  ): Promise<Stats | BigIntStats>;
  async function watchedLstat(
    pathInput: PathLike,
    options?: StatOptions,
  ): Promise<Stats | BigIntStats> {
    try {
      return await originalLstat(pathInput, options);
    } catch (error) {
      if (
        String(pathInput) === journal &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        missingReads++;
        if (missingReads === 2)
          await writeFile(
            journal,
            JSON.stringify({
              version: 1,
              state: "prepared",
              operationId: "external",
            }),
          );
      }
      throw error;
    }
  }
  const lstatSpy = spyOn(fsPromises, "lstat").mockImplementation(watchedLstat);
  let result;
  try {
    result = await applyChangeRePin({
      rootInput: f.linked,
      changeInput: f.change,
      schemaInput: "portable",
      selection: { profiles: [], noProfiles: false, skillHosts: [] },
    });
  } finally {
    lstatSpy.mockRestore();
  }
  expect(missingReads).toBeGreaterThanOrEqual(2);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("REPIN_RECOVERY_REQUIRED");
  expect(await readFile(receipt)).toEqual(before);
  expect(JSON.parse(await readFile(journal, "utf8")).state).toBe("prepared");
}, 30000);

for (const edit of [
  "bytes",
  "mode",
  "replacement",
  "receipt",
  "route",
] as const) {
  test(`Apply refuses ${edit} changed during receipt callback before activation`, async () => {
    const f = await reviewedApplyFixture();
    const originalReceipt = await readFile(f.receipt);
    const originalReceiptMode = (await stat(f.receipt)).mode & 0o777;
    const originalOpen = fsPromises.open;
    const originalLstat = fsPromises.lstat;
    let stage = "";
    let stageIno = 0;
    let replacementBytes: Buffer | undefined;
    let injected = false;
    const openSpy = spyOn(fsPromises, "open").mockImplementation(
      async (...args: Parameters<typeof fsPromises.open>) => {
        const handle = await originalOpen(...args);
        const file = String(args[0]);
        if (file.includes(".opsx-provenance.json.") && file.endsWith(".tmp")) {
          stage = file;
          stageIno = (await handle.stat()).ino;
        }
        return handle;
      },
    );
    async function watchedLstat(
      pathInput: PathLike,
      options?: StatOptions & { bigint?: false },
    ): Promise<Stats>;
    async function watchedLstat(
      pathInput: PathLike,
      options: StatOptions & { bigint: true },
    ): Promise<BigIntStats>;
    async function watchedLstat(
      pathInput: PathLike,
      options?: StatOptions,
    ): Promise<Stats | BigIntStats>;
    async function watchedLstat(
      pathInput: PathLike,
      options?: StatOptions,
    ): Promise<Stats | BigIntStats> {
      const result = await originalLstat(pathInput, options);
      if (!injected && stage && String(pathInput) === f.journal) {
        injected = true;
        if (edit === "bytes") await fsPromises.appendFile(stage, "foreign\n");
        if (edit === "mode") await chmod(stage, 0o400);
        if (edit === "replacement") {
          const replacement = `${stage}.foreign`;
          replacementBytes = await readFile(stage);
          await writeFile(replacement, replacementBytes);
          await chmod(replacement, (await stat(stage)).mode & 0o777);
          await rename(replacement, stage);
        }
        if (edit === "receipt")
          await fsPromises.appendFile(f.receipt, "foreign\n");
        if (edit === "route")
          await chmod(path.join(f.fixture.linked, "openspec/schemas"), 0o700);
      }
      return result;
    }
    const lstatSpy = spyOn(fsPromises, "lstat").mockImplementation(
      watchedLstat,
    );
    let result;
    try {
      result = await f.apply();
    } finally {
      openSpy.mockRestore();
      lstatSpy.mockRestore();
    }
    expect(injected).toBe(true);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe(
        edit === "receipt"
          ? "STALE_PREVIEW"
          : edit === "route"
            ? "REPIN_ROUTE_CHANGED"
            : "REPIN_STAGE_CHANGED",
      );
    if (edit === "receipt")
      expect(await readFile(f.receipt, "utf8")).toContain("foreign");
    else expect(await readFile(f.receipt)).toEqual(originalReceipt);
    if (edit !== "receipt")
      expect((await stat(f.receipt)).mode & 0o777).toBe(originalReceiptMode);
    if (edit === "bytes")
      expect(await readFile(stage, "utf8")).toContain("foreign");
    if (edit === "mode") expect((await stat(stage)).mode & 0o777).toBe(0o400);
    if (edit === "replacement") {
      expect((await stat(stage)).ino).not.toBe(stageIno);
      if (replacementBytes === undefined)
        throw new Error("Replacement stage bytes were not captured");
      expect(Buffer.compare(await readFile(stage), replacementBytes)).toBe(0);
    }
    if (edit === "bytes" || edit === "mode" || edit === "replacement")
      expect(JSON.parse(await readFile(f.journal, "utf8")).state).toBe(
        "partial",
      );
  }, 30000);
}

for (const edit of ["bytes", "mode"] as const) {
  test(`cleanup retains an owned stage changed in place by ${edit}`, async () => {
    const f = await reviewedApplyFixture();
    const originalReceipt = await readFile(f.receipt);
    const originalOpen = fsPromises.open;
    const originalRename = fsPromises.rename;
    let changedConfig = false;
    let changedStage = false;
    let changedStageMode = 0;
    let stagePath = "";
    const openSpy = spyOn(fsPromises, "open").mockImplementation(
      async (...args: Parameters<typeof fsPromises.open>) => {
        const handle = await originalOpen(...args);
        const file = String(args[0]);
        if (file.includes(".opsx-provenance.json.") && file.endsWith(".tmp")) {
          stagePath = file;
        }
        return handle;
      },
    );
    const renameSpy = spyOn(fsPromises, "rename").mockImplementation(
      async (source, destination) => {
        const result = await originalRename(source, destination);
        if (
          !changedStage &&
          stagePath !== "" &&
          String(destination) === f.journal
        ) {
          await fsPromises.appendFile(f.config, "# external config edit\n");
          changedConfig = true;
          if (edit === "bytes")
            await fsPromises.appendFile(stagePath, "foreign\n");
          else {
            const mode = (await stat(stagePath)).mode & 0o777;
            changedStageMode = mode ^ 0o100;
            await chmod(stagePath, changedStageMode);
          }
          changedStage = true;
        }
        return result;
      },
    );
    let result;
    try {
      result = await f.apply();
    } finally {
      openSpy.mockRestore();
      renameSpy.mockRestore();
    }
    expect(changedConfig).toBe(true);
    expect(changedStage).toBe(true);
    expect(result.ok).toBe(false);
    expect(await readFile(f.receipt)).toEqual(originalReceipt);
    expect(await stat(stagePath)).toBeDefined();
    if (edit === "bytes")
      expect(await readFile(stagePath, "utf8")).toContain("foreign");
    else expect((await stat(stagePath)).mode & 0o777).toBe(changedStageMode);
  }, 30000);
}
