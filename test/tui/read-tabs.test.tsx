import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test } from "bun:test";
import { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { DetailedChange } from "../../src/domain/snapshot.ts";
import type { ChangeHistory } from "../../src/provenance/index.ts";
import { Archive, Changes } from "../../src/tui/browser.tsx";
import { boundedPreview, planningLabel, safeReadError } from "../../src/tui/model.ts";

const roots: string[] = [];
type FrameSetup = Awaited<ReturnType<typeof testRender>>;

async function press(setup: FrameSetup, action: () => void | Promise<void>) {
  await act(async () => { await action(); await Bun.sleep(30); await setup.renderOnce(); });
}

async function waitForFrame(setup: FrameSetup, predicate: (frame: string) => boolean) {
  for (let attempt = 0; attempt < 20; attempt++) {
    let frame = "";
    await act(async () => {
      await setup.renderOnce();
      await Bun.sleep(30);
      frame = setup.captureCharFrame();
    });
    if (predicate(frame)) return frame;
  }
  throw new Error(`Timed out waiting for frame predicate.\n${setup.captureCharFrame()}`);
}
const refA = { name: "schema-v1", source: "/schemas/schema-v1", digest: "a".repeat(64) };
const refB = { name: "schema-v2", source: "/schemas/schema-v2", digest: "b".repeat(64) };
const history: ChangeHistory = {
  name: "target-change",
  created: refA,
  currentSchema: refB.name,
  inherited: false,
  migrations: [{ from: refA, to: refB, at: "2026-01-01T00:00:00.000Z" }],
  retained: refA,
  divergence: null,
};

function change(name: string, tasks: DetailedChange["tasks"] = null): DetailedChange {
  return {
    name,
    status: "in-progress",
    schema: "schema-v2",
    artifacts: [{ id: "proposal", status: "done" }, { id: "design", status: "done" }],
    tasks,
    history: { ...history, name },
    revision: { state: "intact", name: "schema-v2", source: "/schemas/schema-v2", digest: refB.digest, retained: true },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-tui-"));
  roots.push(root);
  const active = path.join(root, "openspec", "changes", "target-change");
  const other = path.join(root, "openspec", "changes", "other-change");
  const archived = path.join(root, "openspec", "changes", "archive", "historical-change");
  await Promise.all([mkdir(active, { recursive: true }), mkdir(other, { recursive: true }), mkdir(archived, { recursive: true })]);
  await writeFile(path.join(root, "openspec", "config.yaml"), "schema: schema-v2\n");
  await writeFile(path.join(active, ".openspec.yaml"), "schema: schema-v2\n");
  await writeFile(path.join(active, "binary.dat"), new Uint8Array([0, 1, 2, 3]));
  await writeFile(path.join(active, "proposal.md"), "before line\n");
  await writeFile(path.join(other, "proposal.md"), "other change\n");
  await writeFile(path.join(archived, ".openspec.yaml"), "schema: schema-v2\n");
  await writeFile(path.join(archived, ".opsx-provenance.json"), JSON.stringify({
    version: 1,
    created: refA,
    migrations: [{ from: refA, to: refB, at: "2026-01-01T00:00:00.000Z" }],
    retained: refA,
  }));
  await writeFile(path.join(archived, "report.md"), "archive before\n");
  await writeFile(path.join(archived, "tasks.md"), "- [x] First task\n- [ ] Second task\n- [X] Third task\n");

  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "TUI test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "tui@example.invalid"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture baseline"], { cwd: root });
  await writeFile(path.join(active, "proposal.md"), "after line\n");
  await writeFile(path.join(active, "untracked.md"), "untracked new\n");
  await writeFile(path.join(archived, "report.md"), "archive after\n");
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("Changes filters, reads files safely, shows Git HEAD diff, and escapes back to the list", async () => {
  const root = await fixture();
  const setup = await testRender(
    <Changes root={root} changes={[change("target-change"), change("other-change")]} loadDetail={async name => change(name)} />,
    { width: 110, height: 36 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressKey("/"));
    await press(setup, () => setup.mockInput.typeText("target"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("target-change") && !frame.includes("other-change"));

    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("schema-v1"));
    await waitForFrame(setup, (frame) => frame.includes("binary.dat"));
    let detail = setup.captureCharFrame();
    expect(detail).toContain("target-change");
    expect(detail).toContain("in-progress");
    expect(detail).toContain("schema-v2");
    expect(detail).toContain("schema-v1 → schema-v2");
    expect(detail).toContain("2/2 artifacts ready");
    expect(detail).toContain("Unknown");
    expect(detail).toContain("intact");
    expect(detail).toContain("binary.dat");

    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    const binary = await waitForFrame(setup, (frame) => frame.includes("binary or is not valid UTF-8 text"));
    expect(binary).toContain("target-change/binary.dat");

    await press(setup, () => setup.mockInput.pressEscape());
    await waitForFrame(setup, (frame) => frame.includes("proposal.md") && !frame.includes("UTF-8"));
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("after line"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    const diff = await waitForFrame(setup, (frame) => frame.includes("- before line") && frame.includes("+ after line"));
    expect(diff).toContain("target-change/proposal.md");

    await press(setup, () => setup.mockInput.pressEscape());
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("untracked new"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    const addition = await waitForFrame(setup, (frame) => frame.includes("+ untracked new"));
    expect(addition).toContain("untracked new");

    await press(setup, () => setup.mockInput.pressEscape());
    detail = await waitForFrame(setup, (frame) => frame.includes("untracked.md") && !frame.includes("+ untracked new"));
    expect(detail).toContain("untracked.md");
    await press(setup, () => setup.mockInput.pressEscape());
    const back = await waitForFrame(setup, (frame) => frame.includes("Changes | List") && frame.includes("target-change") && !frame.includes("other-change"));
    expect(back).toContain("READ ONLY");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Changes resolves details only when selected, refreshes edited detail, and surfaces errors", async () => {
  const root = await fixture();
  const reads: string[] = [];
  let requestRefresh = () => { };
  const Harness = () => {
    const [refreshVersion, setRefreshVersion] = useState(0);
    requestRefresh = () => setRefreshVersion(value => value + 1);
    return <Changes
      root={root}
      changes={[change("target-change"), change("other-change")]}
      refreshVersion={refreshVersion}
      loadDetail={async name => {
        const priorReads = reads.filter(candidate => candidate === name).length;
        reads.push(name);
        if (name === "other-change") throw new Error("private OpenSpec failure");
        return { ...change(name), status: priorReads === 0 ? "in-progress" : "updated" };
      }}
    />;
  };
  const setup = await testRender(
    <Harness />,
    { width: 100, height: 24 },
  );
  try {
    await setup.renderOnce();
    expect(reads).toEqual([]);
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, frame => frame.includes("schema-v1"));
    expect(reads).toEqual(["target-change"]);
    await act(async () => { requestRefresh(); await Bun.sleep(30); await setup.renderOnce(); });
    await waitForFrame(setup, frame => frame.includes("updated"));
    expect(reads).toEqual(["target-change", "target-change"]);
    await press(setup, () => setup.mockInput.pressEscape());
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    const failed = await waitForFrame(setup, frame => frame.includes("Change detail read failed"));
    expect(failed).toContain("safely.");
    expect(failed).not.toContain("private OpenSpec failure");
    expect(reads).toEqual(["target-change", "target-change", "other-change"]);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Changes distinguishes an empty list from a filter with no matches", async () => {
  const root = await fixture();
  const empty = await testRender(<Changes root={root} changes={[]} loadDetail={async name => change(name)} />, { width: 80, height: 20 });
  let emptyFrame = "";
  try {
    await empty.renderOnce();
    emptyFrame = empty.captureCharFrame();
    expect(emptyFrame).not.toContain("target-change");
  } finally {
    act(() => empty.renderer.destroy());
  }

  const setup = await testRender(<Changes root={root} changes={[change("target-change")]} loadDetail={async name => change(name)} />, { width: 80, height: 20 });
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressKey("/"));
    await press(setup, () => setup.mockInput.typeText("missing"));
    await press(setup, () => setup.mockInput.pressEnter());
    const noMatches = await waitForFrame(setup, frame => frame.includes("missing") && !frame.includes("target-change"));
    const withoutQuery = (frame: string) => frame.split("\n").filter(row => !row.includes("missing") && !row.includes("(none)")).join("\n");
    expect(withoutQuery(noMatches)).not.toBe(withoutQuery(emptyFrame));
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Changes remains navigable at compact terminal sizes", async () => {
  const root = await fixture();
  const longChangeName = "improve-opsx-read-performance-and-terminal-ux-integration";
  const longChangeDirectory = path.join(root, "openspec", "changes", longChangeName);
  await mkdir(longChangeDirectory, { recursive: true });
  await writeFile(path.join(longChangeDirectory, ".openspec.yaml"), "schema: schema-v2\n");
  await writeFile(path.join(longChangeDirectory, "proposal.md"), "after line\n" + Array.from({ length: 45 }, (_, index) => `retained line ${index}`).join("\n"));
  for (const [width, height] of [[60, 18], [100, 32]] as const) {
    const setup = await testRender(
      <Changes root={root} changes={[change(longChangeName, { complete: 11, total: 16, remaining: 5 })]} loadDetail={async name => change(name, { complete: 11, total: 16, remaining: 5 })} />,
      { width, height },
    );
    try {
      await setup.renderOnce();
      const visibleIdentity = (frame: string) => [1, 3].some(column => frame.split("\n")
        .map(line => line.split("│")[column] ?? "").join("").replaceAll(/[█▀▄\s]/g, "").includes(longChangeName));
      expect(visibleIdentity(setup.captureCharFrame())).toBe(true);
      await press(setup, () => setup.mockInput.pressEnter());
      const detail = await waitForFrame(setup, frame => visibleIdentity(frame) && frame.includes(".openspec.yaml"));
      await press(setup, () => setup.mockInput.pressArrow("down"));
      await waitForFrame(setup, frame => frame.includes("proposal.md"));
      if (width === 60) expect(detail).not.toContain("schema-v2");
      await press(setup, () => setup.mockInput.pressKey("m"));
      let summary = setup.captureCharFrame();
      for (let step = 0; step < 12 && !summary.includes("schema-v2"); step++) {
        await press(setup, () => setup.mockInput.pressArrow("down"));
        summary = setup.captureCharFrame();
      }
      expect(summary).toContain("schema-v2");
      const visibleSummary = (frame: string) => frame.split("\n").map(line => line.split("│")[1] ?? "").join("").replaceAll(/[█▀▄\s]/g, "");
      for (let step = 0; step < 24 && !visibleSummary(summary).includes("11/16"); step++) {
        await press(setup, () => setup.mockInput.pressArrow("down"));
        summary = setup.captureCharFrame();
      }
      expect(visibleSummary(summary)).toContain("11/16");
      await press(setup, () => setup.mockInput.pressKey("f"));
      await press(setup, () => setup.mockInput.pressEnter());
      let file = await waitForFrame(setup, frame => frame.includes("after line") && frame.includes("proposal.md"));
      for (let step = 0; step < 50 && !file.includes("retained line 40"); step++) {
        await press(setup, () => setup.mockInput.pressArrow("down"));
        file = setup.captureCharFrame();
      }
      expect(file).toContain("retained line 40");
      await press(setup, () => setup.mockInput.pressEscape());
      await waitForFrame(setup, frame => frame.includes("proposal.md") && !frame.includes("after line"));
      await press(setup, () => setup.mockInput.pressEscape());
      await waitForFrame(setup, frame => frame.includes("List") && visibleIdentity(frame));
    } finally {
      act(() => setup.renderer.destroy());
    }
  }
});

test("Archive browses historical provenance and diffs without treating records as active", async () => {
  const root = await fixture();
  const setup = await testRender(<Archive root={root} records={[{ name: "historical-change" }]} />, { width: 110, height: 36 });
  try {
    await setup.renderOnce();
    const list = setup.captureCharFrame();
    expect(list).toContain("historical-change");
    await press(setup, () => setup.mockInput.pressEnter());
    const detail = await waitForFrame(setup, (frame) => frame.includes("schema-v1"));
    expect(detail).toContain("historical-change (not active)");
    expect(detail).toContain("historical; not active");
    expect(detail).toContain("current schema-v2");
    expect(detail).toContain("schema-v1 → schema-v2");
    expect(detail).toContain("report.md");
    expect(detail).toContain("2/3 implementation tasks checked");
    expect(detail).not.toContain("Create change");
    expect(detail).not.toContain("Apply");
    await press(setup, () => setup.mockInput.pressKey("m"));
    let planning = setup.captureCharFrame();
    for (let step = 0; step < 15 && !planning.replaceAll(/[│█▀▄\s]/g, "").includes("artifactstatusunavailable;0planningfilesretained"); step++) {
      await press(setup, () => setup.mockInput.pressArrow("down"));
      planning = setup.captureCharFrame();
    }
    expect(planning.replaceAll(/[│█▀▄\s]/g, "")).toContain("artifactstatusunavailable;0planningfilesretained");
    await press(setup, () => setup.mockInput.pressKey("f"));

    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("archive after"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    const diff = await waitForFrame(setup, (frame) => frame.includes("- archive before") && frame.includes("+ archive after"));
    expect(diff).toContain("historical-change/report.md");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("read-model bounds previews and reports safe errors without leaking paths", () => {
  const preview = planningLabel({ ready: 0, total: 0, complete: null });
  const bounded = boundedPreview(Array.from({ length: 150 }, (_, index) => `line ${index}`).join("\n"), 12_000, 20);
  const error = safeReadError({ code: "FILE_TOO_LARGE", message: "/private/project/secret.bin is too large" });
  expect(preview).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
  expect(preview).not.toMatch(/\b\d+(?:\.\d+)?%/);
  expect(bounded.truncated).toBe(true);
  expect(bounded.text).toContain("line 19");
  expect(bounded.text).not.toContain("line 20");
  expect(error).toBe("This file exceeds the 1 MiB read limit.");
  expect(error).not.toContain("private/project");
});
