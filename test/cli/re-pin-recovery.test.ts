import { expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fsPromises from "node:fs/promises";
import {
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { changeDirectory } from "../../src/archive/index.ts";
import type { RePinSelection } from "../../src/cli/repin.ts";
import {
  applyChangeRePin,
  previewChangeRePin,
  previewChangeRePinRecovery,
  recoverChangeRePin,
} from "../../src/cli/repin.ts";
import {
  effectiveRevision,
  readProvenance,
} from "../../src/provenance/index.ts";
import type { SkillInstallHostId } from "../../src/resources/index.ts";
import {
  apply as applySchemaSwitch,
  preview as previewSchemaSwitch,
} from "../../src/switch/index.ts";
import { linkedFixture } from "./portable-fixture.ts";

const selection = {
  profiles: [] as string[],
  noProfiles: false,
  skillHosts: [] as SkillInstallHostId[],
};

async function completeWorkflow(root: string, change: string): Promise<void> {
  const directory = await changeDirectory(root, change);
  await writeFile(
    path.join(directory, "proposal.md"),
    "## Why\n\nReason.\n\n## What Changes\n\n- Add behavior.\n\n## Capabilities\n\n### New Capabilities\nNone.\n\n### Modified Capabilities\n- fixture\n\n## Impact\n\nCLI.\n",
  );
  await mkdir(path.join(directory, "specs/fixture"), { recursive: true });
  await writeFile(
    path.join(directory, "specs/fixture/spec.md"),
    "## ADDED Requirements\n\n### Requirement: Fixture behavior\nThe system MUST support the fixture behavior.\n\n#### Scenario: Works\n- **WHEN** requested\n- **THEN** it works\n",
  );
  await writeFile(
    path.join(directory, "design.md"),
    "# Design\n\n## Context\nFixture.\n\n## Goals / Non-Goals\nGoal.\n\n## Decisions\nUse existing behavior.\n\n## Risks / Trade-offs\nNone.\n",
  );
  await writeFile(
    path.join(directory, "adr.md"),
    "# Architecture Decision Record\n\n## Status\nAccepted\n\n## Context\nFixture.\n\n## Decision\nUse the existing implementation.\n\n## Consequences\nNo change.\n",
  );
  await writeFile(
    path.join(directory, "tasks.md"),
    "## 1. Implementation\n- [ ] 1.1 Implement fixture behavior\n",
  );
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

async function verifiedReceiptStage(root: string): Promise<string> {
  const journal = JSON.parse(
    await readFile(
      path.join(root, "openspec/.opsx/re-pin-journal.json"),
      "utf8",
    ),
  );
  const relative = `openspec/.opsx/..opsx-provenance.json.${journal.operationId}.tmp`;
  const stage = path.join(root, relative);
  const info = await fsPromises.lstat(stage);
  expect(journal.receiptStageIdentity).toBeDefined();
  expect(info.isFile() && !info.isSymbolicLink()).toBe(true);
  expect(String(info.dev)).toBe(journal.receiptStageIdentity.dev);
  expect(String(info.ino)).toBe(journal.receiptStageIdentity.ino);
  expect(info.mode & 0o777).toBe(journal.receiptStageIdentity.mode);
  expect(await readFile(stage)).toEqual(
    Buffer.from(journal.intended, "base64"),
  );
  return relative;
}

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

async function pendingFixture(
  boundary: "absent" | "present" = "absent",
  associated = false,
) {
  const roots: string[] = [];
  const fixture = await linkedFixture(roots, associated);
  const root = fixture.linked;
  await completeWorkflow(root, fixture.change);
  execFileSync("git", ["worktree", "remove", "--force", fixture.original], {
    cwd: root,
  });
  const directory = await changeDirectory(root, fixture.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const value = JSON.parse(await readFile(receipt, "utf8"));
  value.created.source = path.join(
    path.dirname(root),
    "vanished",
    "openspec/schemas/portable",
  );
  delete value.created.origin;
  if (value.association) value.association.effectiveRevision = value.created;
  for (const establishment of value.establishments ?? [])
    establishment.association.effectiveRevision = value.created;
  await writeFile(receipt, JSON.stringify(value));
  const fixtureSelection: RePinSelection = associated
    ? {
        profiles: [],
        noProfiles: true,
        skillHosts: [],
        bundle: "default",
      }
    : { ...selection };
  const review = await previewChangeRePin(
    root,
    fixture.change,
    "portable",
    fixtureSelection,
  );
  if (!review.ok || !review.confirmation)
    throw new Error(
      `Expected a ready missing-origin re-pin review: ${JSON.stringify(review)}`,
    );
  const originalRename = fsPromises.rename;
  let interrupted = false;
  const journal = path.join(root, "openspec/.opsx/re-pin-journal.json");
  let journalRenames = 0;
  const renameSpy = spyOn(fsPromises, "rename").mockImplementation(
    async (source, destination) => {
      const target = String(destination);
      if (target === journal) journalRenames++;
      const atBoundary =
        boundary === "absent"
          ? target === receipt
          : target === journal && journalRenames === 2;
      if (!interrupted && atBoundary) {
        interrupted = true;
        throw new Error(
          `simulated process interruption at ${boundary} boundary`,
        );
      }
      return originalRename(source, destination);
    },
  );
  try {
    const applied = await applyChangeRePin({
      rootInput: root,
      changeInput: fixture.change,
      schemaInput: "portable",
      applyToken: review.confirmation.token,
      confirmationText: review.confirmation.exactTarget,
      selection: fixtureSelection,
    });
    if (applied.ok) throw new Error("Expected the injected interruption");
  } finally {
    renameSpy.mockRestore();
  }
  if (!interrupted)
    throw new Error("Receipt activation boundary was not reached");
  return {
    roots,
    fixture,
    root,
    receipt,
    selection: fixtureSelection,
    applyToken: review.confirmation.token,
  };
}

test("Apply retains a stamped receipt stage when activation fails", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const journal = JSON.parse(
      await readFile(
        path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
        "utf8",
      ),
    );
    expect(journal.state).not.toBe("complete");
    expect(journal.receiptStageIdentity).toBeDefined();
    const stage = path.join(
      state.root,
      "openspec/.opsx",
      `..opsx-provenance.json.${journal.operationId}.tmp`,
    );
    const identity = await fsPromises.lstat(stage);
    expect(await readFile(stage)).toEqual(
      Buffer.from(journal.intended, "base64"),
    );
    expect(String(identity.dev)).toBe(journal.receiptStageIdentity.dev);
    expect(String(identity.ino)).toBe(journal.receiptStageIdentity.ino);
    expect(identity.mode & 0o777).toBe(journal.receiptStageIdentity.mode);
    expect(await readFile(state.receipt)).toEqual(
      Buffer.from(journal.expected.bytes, "base64"),
    );
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
});

type CrashBoundary =
  | "prepared-journal-parent-sync"
  | "receipt-stage-sync"
  | "receipt-activation"
  | "receipt-parent-sync"
  | "completion-stage-sync"
  | "completion-activation"
  | "completion-parent-sync";

async function crashAt(boundary: CrashBoundary) {
  const roots: string[] = [];
  const fixture = await linkedFixture(roots);
  const root = fixture.linked;
  await completeWorkflow(root, fixture.change);
  execFileSync("git", ["worktree", "remove", "--force", fixture.original], {
    cwd: root,
  });
  const directory = await changeDirectory(root, fixture.change);
  const receipt = path.join(directory, ".opsx-provenance.json");
  const value = JSON.parse(await readFile(receipt, "utf8"));
  value.created.source = path.join(
    path.dirname(root),
    "vanished",
    "openspec/schemas/portable",
  );
  delete value.created.origin;
  await writeFile(receipt, JSON.stringify(value));
  const review = await previewChangeRePin(root, fixture.change, "portable", {
    ...selection,
  });
  if (!review.ok || !review.confirmation)
    throw new Error("Expected a ready missing-origin re-pin review");
  const marker = path.join(
    root,
    `.test-re-pin-${boundary}-${process.pid}.marker`,
  );
  const cliPath = path.resolve(import.meta.dir, "../../src/domain/cli.ts");
  const preloadPath = path.resolve(
    import.meta.dir,
    "./re-pin-recovery-crash-hook.ts",
  );
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "--preload",
      preloadPath,
      cliPath,
      "--test-repin-boundary",
      boundary,
      "--test-repin-marker",
      marker,
      "--project",
      root,
      "--json",
      "change",
      "re-pin",
      fixture.change,
      "portable",
      "--apply-token",
      review.confirmation.token,
      "--confirm",
      review.confirmation.exactTarget,
    ],
    cwd: root,
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const reached = await readFile(marker, "utf8");
      if (reached !== boundary)
        throw new Error(`Crash hook marked unexpected boundary: ${reached}`);
      await child.exited;
      if (child.signalCode !== "SIGKILL")
        throw new Error(
          `Crash hook child did not receive SIGKILL: ${child.signalCode}`,
        );
      return { roots, fixture, root, receipt, marker };
    } catch {}
    if (child.exitCode !== null)
      throw new Error(
        `Apply child exited before ${boundary}: ${child.exitCode}`,
      );
    await Bun.sleep(5);
  }
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await child.exited;
  }
  throw new Error(`Timed out waiting for the ${boundary} crash hook`);
}

async function crashDuringRecovery(
  state: Awaited<ReturnType<typeof crashAt>>,
): Promise<string> {
  const inspection = await previewChangeRePinRecovery(
    state.root,
    state.fixture.change,
    "portable",
  );
  if (!inspection.ok || !inspection.confirmation)
    throw new Error("Expected a confirmed pending recovery intent");
  const marker = path.join(
    state.root,
    `.test-re-pin-recovery-${process.pid}.marker`,
  );
  const cliPath = path.resolve(import.meta.dir, "../../src/domain/cli.ts");
  const preloadPath = path.resolve(
    import.meta.dir,
    "./re-pin-recovery-crash-hook.ts",
  );
  const child = Bun.spawn({
    cmd: [
      process.execPath,
      "--preload",
      preloadPath,
      cliPath,
      "--test-repin-boundary",
      "receipt-stage-sync",
      "--test-repin-marker",
      marker,
      "--project",
      state.root,
      "--json",
      "change",
      "re-pin",
      state.fixture.change,
      "portable",
      "--recover",
      "--recovery-token",
      inspection.confirmation.token,
      "--confirm",
      inspection.confirmation.exactTarget,
    ],
    cwd: state.root,
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const reached = await readFile(marker, "utf8");
      if (reached !== "receipt-stage-sync")
        throw new Error(`Crash hook marked unexpected boundary: ${reached}`);
      await child.exited;
      if (child.signalCode !== "SIGKILL")
        throw new Error(
          `Crash hook child did not receive SIGKILL: ${child.signalCode}`,
        );
      return marker;
    } catch {}
    if (child.exitCode !== null)
      throw new Error(
        `Recovery child exited before staging: ${child.exitCode}`,
      );
    await Bun.sleep(5);
  }
  child.kill("SIGKILL");
  await child.exited;
  throw new Error(
    "Timed out waiting for the recovery receipt-stage crash hook",
  );
}

test("--recover inspects an absent exact intent without changing project bytes", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const before = await treeBytes(state.root);
    const response = cli(
      state.root,
      "change",
      "re-pin",
      state.fixture.change,
      "portable",
      "--recover",
    );
    expect(response.code).toBe(0);
    const envelope = JSON.parse(response.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.data.recovery.disposition).toBe("absent");
    expect(envelope.data.data.recovery.target).toBe(
      "openspec/changes/sample/.opsx-provenance.json",
    );
    expect(envelope.data.data.historicalOrigin.warning).toBe(
      "The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.",
    );
    expect(envelope.data.confirmation.exactTarget).toContain(
      envelope.data.data.historicalOrigin.oldLocation,
    );
    expect(envelope.data.confirmation.exactTarget).toContain(
      envelope.data.data.historicalOrigin.currentLocation,
    );
    expect(await treeBytes(state.root)).toEqual(before);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
});

test("recovery requires its own token and replays the exact absent intent once", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const beforeReceipt = await readFile(state.receipt);
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a fresh token for absent recovery intent");
    expect(inspection.data.recovery.disposition).toBe("absent");

    const ordinaryToken = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: state.applyToken,
      confirmationText: inspection.confirmation.exactTarget,
    });
    expect(ordinaryToken.ok).toBe(false);
    if (!ordinaryToken.ok)
      expect(ordinaryToken.error.code).toBe("STALE_PREVIEW");
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);

    const missingConfirmation = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: inspection.confirmation.token,
    });
    expect(missingConfirmation.ok).toBe(false);
    if (!missingConfirmation.ok)
      expect(missingConfirmation.error.code).toBe(
        "REPIN_RECOVERY_CONFIRMATION_REQUIRED",
      );
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);

    const recovered = cli(
      state.root,
      "change",
      "re-pin",
      state.fixture.change,
      "portable",
      "--recover",
      "--recovery-token",
      inspection.confirmation.token,
      "--confirm",
      inspection.confirmation.exactTarget,
    );
    expect(recovered.code).toBe(0);
    const recoveredEnvelope = JSON.parse(recovered.output);
    expect(recoveredEnvelope.ok).toBe(true);
    expect(recoveredEnvelope.data.phase).toBe("applied");
    const journal = JSON.parse(
      await readFile(
        path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
        "utf8",
      ),
    );
    expect(journal.state).toBe("complete");
    expect(await readFile(state.receipt)).toEqual(
      Buffer.from(journal.intended, "base64"),
    );
    const receipt = JSON.parse(await readFile(state.receipt, "utf8"));
    expect(receipt.rePins).toHaveLength(1);
    expect(receipt.rePins[0].operationId).toBe(journal.operationId);

    const completeInspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(completeInspection.ok).toBe(true);
    if (completeInspection.ok)
      expect(completeInspection.data.recovery.disposition).toBe("complete");
    const afterCompletion = await treeBytes(state.root);
    const retryInspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(retryInspection.ok).toBe(true);
    expect(await treeBytes(state.root)).toEqual(afterCompletion);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("recovery completes an exact-present intent after receipt activation", async () => {
  const state = await pendingFixture("present");
  let passed = false;
  try {
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a fresh token for present recovery intent");
    expect(inspection.data.recovery.disposition).toBe("present");
    const recovered = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: inspection.confirmation.token,
      confirmationText: inspection.confirmation.exactTarget,
    });
    if (!recovered.ok)
      throw new Error(`${recovered.error.code}: ${recovered.error.message}`);
    const journal = JSON.parse(
      await readFile(
        path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
        "utf8",
      ),
    );
    expect(journal.state).toBe("complete");
    const receipt = JSON.parse(await readFile(state.receipt, "utf8"));
    expect(receipt.rePins).toHaveLength(1);
    expect(receipt.rePins[0].operationId).toBe(journal.operationId);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("foreign same-intent journal stage is preserved and blocks recovery", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const journal = JSON.parse(await readFile(journalFile, "utf8"));
    const foreignStage = path.join(
      path.dirname(journalFile),
      `.re-pin-journal.json.${journal.operationId}-recovery-foreign.tmp`,
    );
    const foreignIntent = { ...journal };
    delete foreignIntent.receiptStageIdentity;
    const foreignBytes = `${JSON.stringify(foreignIntent)}\n`;
    await writeFile(foreignStage, foreignBytes, { mode: 0o600 });
    const beforeReceipt = await readFile(state.receipt);
    const beforeJournal = await readFile(journalFile);
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok) throw new Error(inspection.error.message);
    expect(inspection.data.recovery.disposition).toBe("conflicted");
    expect(inspection.data.ready).toBe(false);
    expect(inspection.confirmation).toBeUndefined();
    const recovered = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: state.applyToken,
    });
    expect(recovered.ok).toBe(false);
    if (!recovered.ok)
      expect(recovered.error.code).toBe("REPIN_RECOVERY_CONFLICT");
    expect(await readFile(foreignStage, "utf8")).toBe(foreignBytes);
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);
    expect(await readFile(journalFile)).toEqual(beforeJournal);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("copied receipt identity does not own journal stages at plausible names", async () => {
  const state = await pendingFixture("present");
  let passed = false;
  try {
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const journalBytes = await readFile(journalFile);
    const journal = JSON.parse(journalBytes.toString("utf8"));
    expect(journal.receiptStageIdentity).toBeDefined();
    const receiptBytes = await readFile(state.receipt);
    const copiedBytes = Buffer.from(`${JSON.stringify(journal)}\n`);
    const stem = `.re-pin-journal.json.${journal.operationId}`;
    for (const suffix of [
      ".tmp",
      "-receipt-stage.tmp",
      "-recovery-stage.tmp",
      `-recovery-${journal.operationId}.tmp`,
      "-recovery-foreign.tmp",
    ]) {
      const foreignStage = path.join(path.dirname(journalFile), stem + suffix);
      await writeFile(foreignStage, copiedBytes, { mode: 0o600 });
      const inspection = await previewChangeRePinRecovery(
        state.root,
        state.fixture.change,
        "portable",
      );
      expect(inspection.ok).toBe(true);
      if (!inspection.ok) throw new Error(inspection.error.message);
      expect(inspection.data.recovery.disposition).toBe("conflicted");
      expect(inspection.data.ready).toBe(false);
      expect(inspection.confirmation).toBeUndefined();
      const recovered = await recoverChangeRePin({
        rootInput: state.root,
        changeInput: state.fixture.change,
        schemaInput: "portable",
        recoveryToken: state.applyToken,
      });
      expect(recovered.ok).toBe(false);
      if (!recovered.ok)
        expect(recovered.error.code).toBe("REPIN_RECOVERY_CONFLICT");
      expect(await readFile(foreignStage)).toEqual(copiedBytes);
      expect(await readFile(state.receipt)).toEqual(receiptBytes);
      expect(await readFile(journalFile)).toEqual(journalBytes);
      await unlink(foreignStage);
    }
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 180000);

test("a convincing completion stage remains untouched after recovery", async () => {
  const state = await pendingFixture("present");
  let passed = false;
  try {
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const journal = JSON.parse(await readFile(journalFile, "utf8"));
    expect(journal.receiptStageIdentity).toBeDefined();
    const stage = path.join(
      path.dirname(journalFile),
      `.re-pin-journal.json.${journal.operationId}.tmp`,
    );
    const stageBytes = Buffer.from(
      `${JSON.stringify({ ...journal, state: "complete" })}\n`,
    );
    await writeFile(stage, stageBytes, { mode: 0o600 });
    const stageInfo = await fsPromises.lstat(stage);
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a fresh token for exact-present recovery");
    expect(inspection.data.recovery.disposition).toBe("present");
    const recovered = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: inspection.confirmation.token,
      confirmationText: inspection.confirmation.exactTarget,
    });
    expect(recovered.ok).toBe(true);
    expect(await readFile(stage)).toEqual(stageBytes);
    expect((await fsPromises.lstat(stage)).ino).toBe(stageInfo.ino);
    expect((await fsPromises.lstat(stage)).mode & 0o777).toBe(0o600);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("recovered re-pin history remains exact through a later guarded migration", async () => {
  const state = await pendingFixture("absent", true);
  let passed = false;
  try {
    const directory = await changeDirectory(state.root, state.fixture.change);
    const receiptFile = path.join(directory, ".opsx-provenance.json");
    const pinFile = path.join(directory, ".openspec.yaml");
    const configFile = path.join(state.root, "openspec/config.yaml");
    const pinBeforeRecovery = await readFile(pinFile);
    const configBeforeRecovery = await readFile(configFile);
    const stageRelative = await verifiedReceiptStage(state.root);
    const beforeRecoveryTree = await treeBytes(state.root);
    const artifactNames = [
      "proposal.md",
      "specs/fixture/spec.md",
      "design.md",
      "adr.md",
      "tasks.md",
    ];
    const artifactsBeforeMigration = await Promise.all(
      artifactNames.map((name) => readFile(path.join(directory, name))),
    );
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a fresh recovery token before later migration");
    const recovered = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: inspection.confirmation.token,
      confirmationText: inspection.confirmation.exactTarget,
    });
    if (!recovered.ok)
      throw new Error(`${recovered.error.code}: ${recovered.error.message}`);
    const afterRecoveryTree = await treeBytes(state.root);
    const receiptRelative = path.relative(state.root, receiptFile);
    const journalRelative = "openspec/.opsx/re-pin-journal.json";
    expect(
      afterRecoveryTree.filter(
        ([name]) => name !== receiptRelative && name !== journalRelative,
      ),
    ).toEqual(
      beforeRecoveryTree.filter(
        ([name]) =>
          name !== receiptRelative &&
          name !== journalRelative &&
          name !== stageRelative,
      ),
    );
    expect(
      fsPromises.lstat(path.join(state.root, stageRelative)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(pinFile)).toEqual(pinBeforeRecovery);
    expect(await readFile(configFile)).toEqual(configBeforeRecovery);
    const afterRecoveryBytes = await readFile(receiptFile);
    const afterRecovery = await readProvenance(directory);
    if (!afterRecovery) throw new Error("Recovered provenance is unreadable");
    const recoveredEvents = afterRecovery.rePins;
    if (!recoveredEvents)
      throw new Error("Recovered re-pin history is missing");
    expect(recoveredEvents).toHaveLength(1);
    const recoveredEvent = recoveredEvents[0]!;
    expect(
      recoveredEvents.filter(
        (event) => event.operationId === recoveredEvent.operationId,
      ),
    ).toHaveLength(1);
    const migrationRequest = {
      schema: "spec-driven",
      profiles: [],
      migrations: [state.fixture.change],
      skillHosts: [] as SkillInstallHostId[],
      skillBundle: "default" as const,
    };
    const reviewedMigration = await previewSchemaSwitch(
      state.root,
      migrationRequest,
    );
    expect(
      reviewedMigration.canApply,
      JSON.stringify(reviewedMigration.diagnostics),
    ).toBe(true);
    const migration = await applySchemaSwitch(
      state.root,
      migrationRequest,
      reviewedMigration.token,
    );
    expect(migration.status).toBe("applied");
    const final = await readProvenance(directory);
    if (!final) throw new Error("Migrated provenance is unreadable");
    expect(final.rePins).toEqual(afterRecovery.rePins);
    expect(final.rePins?.[0]).toEqual(recoveredEvent);
    expect(final.migrations).toHaveLength(afterRecovery.migrations.length + 1);
    expect(final.migrations.slice(0, afterRecovery.migrations.length)).toEqual(
      afterRecovery.migrations,
    );
    const finalMigration = final.migrations.at(-1);
    if (!finalMigration)
      throw new Error("Guarded migration history was not recorded");
    const targetAssociation = reviewedMigration.selectionReceipt.receipt;
    if (!targetAssociation)
      throw new Error("Guarded migration did not review a target association");
    expect(finalMigration.from).toEqual(recoveredEvent.to);
    expect(effectiveRevision(final)).toEqual(finalMigration.to);
    expect(final.association).toEqual(targetAssociation);
    expect(final.association?.effectiveRevision).toEqual(finalMigration.to);
    expect(
      await Promise.all(
        artifactNames.map((name) => readFile(path.join(directory, name))),
      ),
    ).toEqual(artifactsBeforeMigration);
    const resourceRoots = [".agents", ".claude", ".codex", ".omp", ".pi"];
    const resourcesAfterMigration = await treeBytes(state.root);
    expect(
      resourcesAfterMigration.filter(([name]) =>
        resourceRoots.some((resourceRoot) =>
          name.startsWith(`${resourceRoot}/`),
        ),
      ),
    ).toEqual(
      afterRecoveryTree.filter(([name]) =>
        resourceRoots.some((resourceRoot) =>
          name.startsWith(`${resourceRoot}/`),
        ),
      ),
    );
    expect(
      await readFile(path.join(directory, ".openspec.yaml"), "utf8"),
    ).toContain("schema: spec-driven");
    expect(
      await readFile(path.join(state.root, "openspec/config.yaml"), "utf8"),
    ).toContain("schema: spec-driven");
    expect(await readFile(receiptFile)).not.toEqual(afterRecoveryBytes);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 180000);

test("recovery preserves an explicitly empty associated selection and project resources", async () => {
  const state = await pendingFixture("absent", true);
  let passed = false;
  try {
    const stageRelative = await verifiedReceiptStage(state.root);
    const before = await treeBytes(state.root);
    const receiptRelative = path.relative(state.root, state.receipt);
    const journalRelative = "openspec/.opsx/re-pin-journal.json";
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const journal = JSON.parse(await readFile(journalFile, "utf8"));
    const original = JSON.parse(
      Buffer.from(journal.expected.bytes, "base64").toString("utf8"),
    );
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected an associated empty-selection recovery review");
    expect(inspection.data.recovery.disposition).toBe("absent");
    const recovered = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: inspection.confirmation.token,
      confirmationText: inspection.confirmation.exactTarget,
    });
    if (!recovered.ok)
      throw new Error(`${recovered.error.code}: ${recovered.error.message}`);
    const result = JSON.parse(await readFile(state.receipt, "utf8"));
    expect(result.rePins).toHaveLength(1);
    expect(result.rePins[0].associationBefore).toEqual(original.association);
    expect(result.association.profiles).toEqual(original.association.profiles);
    expect(result.association.skillHosts).toEqual(
      original.association.skillHosts,
    );
    expect(result.association.skillBundle).toBe(
      original.association.skillBundle,
    );
    expect(result.association.manifestDigests).toEqual(
      original.association.manifestDigests,
    );
    expect(result.association.effectiveRevision).toEqual(journal.to);
    expect(result.rePins[0].associationAfter).toEqual(result.association);
    expect(state.selection).toEqual({
      profiles: [],
      noProfiles: true,
      skillHosts: [],
      bundle: "default",
    });
    const after = await treeBytes(state.root);
    expect(
      after.filter(
        ([name]) => name !== receiptRelative && name !== journalRelative,
      ),
    ).toEqual(
      before.filter(
        ([name]) =>
          name !== receiptRelative &&
          name !== journalRelative &&
          name !== stageRelative,
      ),
    );
    expect(
      fsPromises.lstat(path.join(state.root, stageRelative)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("conflicted receipt intent stays actionable and read-only", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const changed = Buffer.concat([
      await readFile(state.receipt),
      Buffer.from("\n"),
    ]);
    await writeFile(state.receipt, changed);
    const before = await treeBytes(state.root);
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (inspection.ok) {
      expect(inspection.data.recovery.disposition).toBe("conflicted");
      expect(inspection.confirmation).toBeUndefined();
    }
    expect(await treeBytes(state.root)).toEqual(before);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("completed version-one journal remains readable without a recovery token", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const prior = JSON.parse(await readFile(journalFile, "utf8"));
    await writeFile(
      journalFile,
      JSON.stringify({
        version: 1,
        state: "complete",
        operationId: prior.operationId,
      }),
    );
    const before = await treeBytes(state.root);
    const result = cli(
      state.root,
      "change",
      "re-pin",
      state.fixture.change,
      "portable",
      "--recover",
    );
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.data.recovery.disposition).toBe("complete");
    expect(envelope.data.confirmation).toBeUndefined();
    expect(await treeBytes(state.root)).toEqual(before);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("fresh recovery review refuses post-crash configuration edits", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const config = path.join(state.root, "openspec/config.yaml");
    const originalConfig = await readFile(config);
    const beforeReceipt = await readFile(state.receipt);
    const beforeJournal = await readFile(
      path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
    );
    const reviewed = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok || !reviewed.confirmation)
      throw new Error(
        "Expected a fresh recovery token before the configuration edit",
      );
    await writeFile(
      config,
      Buffer.concat([originalConfig, Buffer.from("\n# recovery edit\n")]),
    );
    const staleApply = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: reviewed.confirmation.token,
      confirmationText: reviewed.confirmation.exactTarget,
    });
    expect(staleApply.ok).toBe(false);
    if (!staleApply.ok)
      expect(staleApply.error.code).toBe("REPIN_RECOVERY_INPUTS_STALE");
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(false);
    if (!inspection.ok)
      expect(inspection.error.code).toBe("REPIN_RECOVERY_INPUTS_STALE");
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);
    expect(
      await readFile(
        path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
      ),
    ).toEqual(beforeJournal);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("foreign recovery stages and same-byte receipt replacement remain conflicts", async () => {
  const foreignState = await pendingFixture();
  let foreignPassed = false;
  try {
    const directory = path.join(foreignState.root, "openspec/.opsx");
    const foreignStage = path.join(
      directory,
      ".opsx-provenance.json.foreign.tmp",
    );
    await writeFile(foreignStage, "external stage\n", { mode: 0o600 });
    const before = await treeBytes(foreignState.root);
    const inspection = await previewChangeRePinRecovery(
      foreignState.root,
      foreignState.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (inspection.ok) {
      expect(inspection.data.recovery.disposition).toBe("conflicted");
      expect(inspection.confirmation).toBeUndefined();
    }
    expect(await treeBytes(foreignState.root)).toEqual(before);
    foreignPassed = true;
  } finally {
    if (foreignPassed)
      await rm(foreignState.roots[0]!, { recursive: true, force: true });
  }

  const presentState = await pendingFixture("present");
  let presentPassed = false;
  try {
    const replacement = `${presentState.receipt}.replacement`;
    const receiptBytes = await readFile(presentState.receipt);
    const receiptMode =
      (await fsPromises.stat(presentState.receipt)).mode & 0o777;
    await writeFile(replacement, receiptBytes, { mode: receiptMode });
    await fsPromises.rename(replacement, presentState.receipt);
    const before = await treeBytes(presentState.root);
    const inspection = await previewChangeRePinRecovery(
      presentState.root,
      presentState.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (inspection.ok) {
      expect(inspection.data.recovery.disposition).toBe("conflicted");
      expect(inspection.confirmation).toBeUndefined();
    }
    expect(await treeBytes(presentState.root)).toEqual(before);
    presentPassed = true;
  } finally {
    if (presentPassed)
      await rm(presentState.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("matching receipt stage without a journal identity remains foreign", async () => {
  const state = await crashAt("prepared-journal-parent-sync");
  let passed = false;
  try {
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const beforeJournal = await readFile(journalFile);
    const beforeReceipt = await readFile(state.receipt);
    const journal = JSON.parse(beforeJournal.toString("utf8"));
    expect(journal.receiptStageIdentity).toBeUndefined();
    const stage = path.join(
      path.dirname(journalFile),
      `..opsx-provenance.json.${journal.operationId}.tmp`,
    );
    const intended = Buffer.from(journal.intended, "base64");
    await writeFile(stage, intended, { mode: journal.expected.mode });
    const inode = (await fsPromises.lstat(stage)).ino;

    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    if (!inspection.ok) throw new Error(inspection.error.message);
    expect(inspection.data.recovery.disposition).toBe("conflicted");
    expect(inspection.data.ready).toBe(false);
    expect(inspection.confirmation).toBeUndefined();
    expect(await readFile(stage)).toEqual(intended);
    expect((await fsPromises.lstat(stage)).ino).toBe(inode);
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);
    expect(await readFile(journalFile)).toEqual(beforeJournal);
    passed = true;
  } finally {
    if (passed) {
      await unlink(state.marker);
      await rm(state.roots[0]!, { recursive: true, force: true });
    }
  }
}, 120000);

test("stale recovery inputs retain a resumed receipt stage", async () => {
  const state = await crashAt("receipt-stage-sync");
  let passed = false;
  try {
    await unlink(path.join(state.root, "openspec/.opsx-switch.lock"));
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const beforeJournal = await readFile(journalFile);
    const beforeReceipt = await readFile(state.receipt);
    const journal = JSON.parse(beforeJournal.toString("utf8"));
    expect(journal.receiptStageIdentity).toBeDefined();
    const stage = path.join(
      path.dirname(journalFile),
      `..opsx-provenance.json.${journal.operationId}.tmp`,
    );
    const stageBytes = await readFile(stage);
    const stageInode = (await fsPromises.lstat(stage)).ino;
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a ready recovery review");
    const config = path.join(state.root, "openspec/config.yaml");
    const originalOpen = fsPromises.open;
    let injected = false;
    const hook = spyOn(fsPromises, "open").mockImplementation(
      async (...args) => {
        const handle = await originalOpen(...args);
        if (String(args[0]) === stage) {
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            const result = await originalSync();
            if (!injected) {
              injected = true;
              await fsPromises.appendFile(
                config,
                "\n# changed during recovery\n",
              );
            }
            return result;
          };
        }
        return handle;
      },
    );
    let recovered;
    try {
      recovered = await recoverChangeRePin({
        rootInput: state.root,
        changeInput: state.fixture.change,
        schemaInput: "portable",
        recoveryToken: inspection.confirmation.token,
        confirmationText: inspection.confirmation.exactTarget,
      });
    } finally {
      hook.mockRestore();
    }
    expect(injected).toBe(true);
    expect(recovered.ok).toBe(false);
    if (recovered.ok) throw new Error("Stale recovery unexpectedly succeeded");
    expect(recovered.error.code).toBe("REPIN_RECOVERY_INPUTS_STALE");
    expect(await readFile(stage)).toEqual(stageBytes);
    expect((await fsPromises.lstat(stage)).ino).toBe(stageInode);
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);
    expect(await readFile(journalFile)).toEqual(beforeJournal);
    passed = true;
  } finally {
    if (passed) {
      await unlink(state.marker);
      await rm(state.roots[0]!, { recursive: true, force: true });
    }
  }
}, 120000);

test("late convincing journal stage invalidates recovery completion", async () => {
  const state = await pendingFixture("present");
  let passed = false;
  try {
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const beforeJournal = await readFile(journalFile);
    const beforeReceipt = await readFile(state.receipt);
    const journal = JSON.parse(beforeJournal.toString("utf8"));
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a ready present-intent review");
    const stage = path.join(
      path.dirname(journalFile),
      `.re-pin-journal.json.${journal.operationId}.tmp`,
    );
    const stageBytes = Buffer.from(
      `${JSON.stringify({ ...journal, state: "complete" })}\n`,
    );
    const changeDirectory = path.dirname(state.receipt);
    const originalOpen = fsPromises.open;
    let injected = false;
    let injectedInode: number | undefined;
    const hook = spyOn(fsPromises, "open").mockImplementation(
      async (...args) => {
        const handle = await originalOpen(...args);
        if (String(args[0]) === changeDirectory) {
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            const result = await originalSync();
            if (!injected) {
              await writeFile(stage, stageBytes, { mode: 0o600 });
              injectedInode = (await fsPromises.lstat(stage)).ino;
              injected = true;
            }
            return result;
          };
        }
        return handle;
      },
    );
    let recovered;
    try {
      recovered = await recoverChangeRePin({
        rootInput: state.root,
        changeInput: state.fixture.change,
        schemaInput: "portable",
        recoveryToken: inspection.confirmation.token,
        confirmationText: inspection.confirmation.exactTarget,
      });
    } finally {
      hook.mockRestore();
    }
    expect(injected).toBe(true);
    expect(recovered.ok).toBe(false);
    if (recovered.ok)
      throw new Error("Recovery completed with a late foreign stage");
    expect(recovered.error.code).toBe("REPIN_RECOVERY_INPUTS_STALE");
    if (injectedInode === undefined)
      throw new Error("Late journal stage had no recorded inode");
    expect(await readFile(stage)).toEqual(stageBytes);
    expect((await fsPromises.lstat(stage)).ino).toBe(injectedInode);
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);
    expect(await readFile(journalFile)).toEqual(beforeJournal);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

test("recovery preserves a reused owned stage edited during its fsync", async () => {
  const state = await crashAt("receipt-stage-sync");
  let passed = false;
  try {
    await unlink(path.join(state.root, "openspec/.opsx-switch.lock"));
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a fresh recovery token for the owned stage");
    const journal = JSON.parse(
      await readFile(
        path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
        "utf8",
      ),
    );
    const stage = path.join(
      state.root,
      "openspec/.opsx",
      `..opsx-provenance.json.${journal.operationId}.tmp`,
    );
    const beforeReceipt = await readFile(state.receipt);
    const originalOpen = fsPromises.open;
    let stageSyncs = 0;
    let injected = false;
    const openSpy = spyOn(fsPromises, "open").mockImplementation(
      async (...args: Parameters<typeof fsPromises.open>) => {
        const handle = await originalOpen(...args);
        if (String(args[0]) === stage) {
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            const result = await originalSync();
            stageSyncs++;
            if (!injected) {
              await fsPromises.appendFile(stage, "external stage edit\n");
              injected = true;
            }
            return result;
          };
        }
        return handle;
      },
    );
    let recovered;
    try {
      recovered = await recoverChangeRePin({
        rootInput: state.root,
        changeInput: state.fixture.change,
        schemaInput: "portable",
        recoveryToken: inspection.confirmation.token,
        confirmationText: inspection.confirmation.exactTarget,
      });
    } finally {
      openSpy.mockRestore();
    }
    expect(injected).toBe(true);
    expect(stageSyncs).toBe(1);
    expect(recovered.ok).toBe(false);
    if (!recovered.ok)
      expect(recovered.error.code).toBe("REPIN_RECOVERY_INPUTS_STALE");
    expect(await readFile(stage, "utf8")).toContain("external stage edit");
    expect(await readFile(state.receipt)).toEqual(beforeReceipt);
    passed = true;
  } finally {
    if (passed) {
      await unlink(state.marker);
      await rm(state.roots[0]!, { recursive: true, force: true });
    }
  }
}, 120000);

test("recovery reports a config edit observed after durable completion", async () => {
  const state = await pendingFixture();
  let passed = false;
  try {
    const inspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(inspection.ok).toBe(true);
    if (!inspection.ok || !inspection.confirmation)
      throw new Error("Expected a fresh recovery token before completion");
    const config = path.join(state.root, "openspec/config.yaml");
    const originalConfig = await readFile(config);
    const externalConfig = Buffer.concat([
      originalConfig,
      Buffer.from("\n# completion boundary edit\n"),
    ]);
    const journalFile = path.join(
      state.root,
      "openspec/.opsx/re-pin-journal.json",
    );
    const journalDirectory = path.dirname(journalFile);
    const originalOpen = fsPromises.open;
    let injected = false;
    const openSpy = spyOn(fsPromises, "open").mockImplementation(
      async (...args: Parameters<typeof fsPromises.open>) => {
        const handle = await originalOpen(...args);
        if (String(args[0]) === journalDirectory) {
          const originalSync = handle.sync.bind(handle);
          handle.sync = async () => {
            const result = await originalSync();
            if (
              !injected &&
              JSON.parse(await readFile(journalFile, "utf8")).state ===
                "complete"
            ) {
              await writeFile(config, externalConfig);
              injected = true;
            }
            return result;
          };
        }
        return handle;
      },
    );
    let recovered;
    try {
      recovered = await recoverChangeRePin({
        rootInput: state.root,
        changeInput: state.fixture.change,
        schemaInput: "portable",
        recoveryToken: inspection.confirmation.token,
        confirmationText: inspection.confirmation.exactTarget,
      });
    } finally {
      openSpy.mockRestore();
    }
    expect(injected).toBe(true);
    expect(recovered.ok).toBe(false);
    if (!recovered.ok)
      expect(recovered.error.code).toBe("REPIN_RECOVERY_POSTFLIGHT");
    const journal = JSON.parse(await readFile(journalFile, "utf8"));
    expect(journal.state).toBe("complete");
    expect(await readFile(config)).toEqual(externalConfig);
    expect(await readFile(state.receipt)).toEqual(
      Buffer.from(journal.intended, "base64"),
    );
    expect(
      JSON.parse(await readFile(state.receipt, "utf8")).rePins,
    ).toHaveLength(1);
    passed = true;
  } finally {
    if (passed) await rm(state.roots[0]!, { recursive: true, force: true });
  }
}, 120000);

for (const boundary of [
  "prepared-journal-parent-sync",
  "receipt-stage-sync",
  "receipt-activation",
  "receipt-parent-sync",
  "completion-stage-sync",
  "completion-activation",
  "completion-parent-sync",
] as const) {
  test(`fresh CLI process recovery after ${boundary}`, async () => {
    const state = await crashAt(boundary);
    let passed = false;
    try {
      expect(await readFile(state.marker, "utf8")).toBe(boundary);
      const beforeInspection = await treeBytes(state.root);
      const inspection = await previewChangeRePinRecovery(
        state.root,
        state.fixture.change,
        "portable",
      );
      expect(inspection.ok).toBe(true);
      if (!inspection.ok) throw new Error(inspection.error.message);
      const expectedDisposition =
        boundary === "completion-activation" ||
        boundary === "completion-parent-sync"
          ? "complete"
          : boundary === "receipt-activation" ||
              boundary === "receipt-parent-sync" ||
              boundary === "completion-stage-sync"
            ? "present"
            : "absent";
      expect(inspection.data.recovery.disposition).toBe(expectedDisposition);
      expect(await treeBytes(state.root)).toEqual(beforeInspection);
      if (expectedDisposition !== "complete") {
        if (!inspection.confirmation)
          throw new Error("Expected a fresh recovery token for pending intent");
        const locked = await recoverChangeRePin({
          rootInput: state.root,
          changeInput: state.fixture.change,
          schemaInput: "portable",
          recoveryToken: inspection.confirmation.token,
          confirmationText: inspection.confirmation.exactTarget,
        });
        expect(locked.ok).toBe(false);
        if (!locked.ok) expect(locked.error.code).toBe("PROJECT_LOCKED");
        expect(await treeBytes(state.root)).toEqual(beforeInspection);
        await unlink(path.join(state.root, "openspec/.opsx-switch.lock"));
        const recovered = await recoverChangeRePin({
          rootInput: state.root,
          changeInput: state.fixture.change,
          schemaInput: "portable",
          recoveryToken: inspection.confirmation.token,
          confirmationText: inspection.confirmation.exactTarget,
        });
        if (!recovered.ok)
          throw new Error(
            `${recovered.error.code}: ${recovered.error.message}`,
          );
      }
      const journal = JSON.parse(
        await readFile(
          path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
          "utf8",
        ),
      );
      expect(journal.state).toBe("complete");
      expect(await readFile(state.receipt)).toEqual(
        Buffer.from(journal.intended, "base64"),
      );
      const receipt = JSON.parse(await readFile(state.receipt, "utf8"));
      expect(
        receipt.rePins.filter(
          (event: { operationId: string }) =>
            event.operationId === journal.operationId,
        ),
      ).toHaveLength(1);
      passed = true;
    } finally {
      if (passed) {
        await unlink(state.marker);
        await rm(state.roots[0]!, { recursive: true, force: true });
      }
    }
  }, 180000);
}

test("recovery resumes after a second fresh-process crash with its owned stage", async () => {
  const state = await crashAt("prepared-journal-parent-sync");
  let recoveryMarker: string | undefined;
  let passed = false;
  try {
    await unlink(path.join(state.root, "openspec/.opsx-switch.lock"));
    recoveryMarker = await crashDuringRecovery(state);
    expect(await readFile(recoveryMarker, "utf8")).toBe("receipt-stage-sync");
    const lock = path.join(state.root, "openspec/.opsx-switch.lock");
    const lockedInspection = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(lockedInspection.ok).toBe(true);
    if (!lockedInspection.ok || !lockedInspection.confirmation)
      throw new Error(
        "Expected fresh recovery authority after the second crash",
      );
    expect(lockedInspection.data.recovery.disposition).toBe("absent");
    const lockedApply = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: lockedInspection.confirmation.token,
      confirmationText: lockedInspection.confirmation.exactTarget,
    });
    expect(lockedApply.ok).toBe(false);
    if (!lockedApply.ok) expect(lockedApply.error.code).toBe("PROJECT_LOCKED");
    await unlink(lock);
    const review = await previewChangeRePinRecovery(
      state.root,
      state.fixture.change,
      "portable",
    );
    expect(review.ok).toBe(true);
    if (!review.ok || !review.confirmation)
      throw new Error("Expected a fresh token for repeated recovery");
    const resumed = await recoverChangeRePin({
      rootInput: state.root,
      changeInput: state.fixture.change,
      schemaInput: "portable",
      recoveryToken: review.confirmation.token,
      confirmationText: review.confirmation.exactTarget,
    });
    if (!resumed.ok)
      throw new Error(`${resumed.error.code}: ${resumed.error.message}`);
    const receipt = JSON.parse(await readFile(state.receipt, "utf8"));
    const journal = JSON.parse(
      await readFile(
        path.join(state.root, "openspec/.opsx/re-pin-journal.json"),
        "utf8",
      ),
    );
    expect(journal.state).toBe("complete");
    expect(
      receipt.rePins.filter(
        (event: { operationId: string }) =>
          event.operationId === journal.operationId,
      ),
    ).toHaveLength(1);
    expect(
      (await readdir(path.join(state.root, "openspec/.opsx"))).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
    passed = true;
  } finally {
    if (passed) {
      if (recoveryMarker) await unlink(recoveryMarker);
      await unlink(state.marker);
      await rm(state.roots[0]!, { recursive: true, force: true });
    }
  }
}, 180000);
