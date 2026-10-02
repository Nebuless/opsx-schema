import { afterEach, expect, spyOn, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type BaseRenderable,
  CodeRenderable,
  getLinkId,
  ScrollBoxRenderable,
  SyntaxStyle,
  TextRenderable,
} from "@opentui/core";
import {
  createTestRenderer,
  setRendererCapabilities,
} from "@opentui/core/testing";
import { useKeyboard } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { act, useState } from "react";
import * as archiveReads from "../../src/archive/index.ts";
import { archivedFile, boundedFile } from "../../src/archive/index.ts";
import type { DetailedChange } from "../../src/domain/snapshot.ts";
import type { ChangeHistory } from "../../src/provenance/index.ts";
import { Archive, Changes } from "../../src/tui/browser.tsx";
import {
  boundedPreview,
  planningLabel,
  safeReadError,
} from "../../src/tui/model.ts";

const roots: string[] = [];
type FrameSetup = Awaited<ReturnType<typeof testRender>>;

async function press(setup: FrameSetup, action: () => void | Promise<void>) {
  await act(async () => {
    await action();
    await Bun.sleep(30);
  });
  // React flushes state/effects when act exits; do not inspect a pre-flush frame.
  await setup.renderOnce();
}

async function waitForFrame(
  setup: FrameSetup,
  predicate: (frame: string) => boolean,
) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await act(async () => {
      await Bun.sleep(30);
    });
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    if (predicate(frame)) return frame;
  }
  throw new Error(
    `Timed out waiting for frame predicate.\n${setup.captureCharFrame()}`,
  );
}
const refA = {
  name: "schema-v1",
  source: "/schemas/schema-v1",
  digest: "a".repeat(64),
};
const refB = {
  name: "schema-v2",
  source: "/schemas/schema-v2",
  digest: "b".repeat(64),
};
const history: ChangeHistory = {
  name: "target-change",
  created: refA,
  currentSchema: refB.name,
  inherited: false,
  migrations: [{ from: refA, to: refB, at: "2026-01-01T00:00:00.000Z" }],
  retained: refA,
  divergence: null,
};

function change(
  name: string,
  tasks: DetailedChange["tasks"] = null,
): DetailedChange {
  return {
    name,
    status: "in-progress",
    schema: "schema-v2",
    artifacts: [
      { id: "proposal", status: "done" },
      { id: "design", status: "done" },
    ],
    tasks,
    history: { ...history, name },
    revision: {
      state: "intact",
      name: "schema-v2",
      source: "/schemas/schema-v2",
      digest: refB.digest,
      retained: true,
    },
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-tui-"));
  roots.push(root);
  const active = path.join(root, "openspec", "changes", "target-change");
  const other = path.join(root, "openspec", "changes", "other-change");
  const archived = path.join(
    root,
    "openspec",
    "changes",
    "archive",
    "historical-change",
  );
  await Promise.all([
    mkdir(active, { recursive: true }),
    mkdir(other, { recursive: true }),
    mkdir(archived, { recursive: true }),
  ]);
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: schema-v2\n",
  );
  await writeFile(path.join(active, ".openspec.yaml"), "schema: schema-v2\n");
  await writeFile(
    path.join(active, "binary.dat"),
    new Uint8Array([0, 1, 2, 3]),
  );
  await writeFile(path.join(active, "proposal.md"), "before line\n");
  await writeFile(path.join(other, "proposal.md"), "other change\n");
  await writeFile(path.join(archived, ".openspec.yaml"), "schema: schema-v2\n");
  await writeFile(
    path.join(archived, ".opsx-provenance.json"),
    JSON.stringify({
      version: 1,
      created: refA,
      migrations: [{ from: refA, to: refB, at: "2026-01-01T00:00:00.000Z" }],
      retained: refA,
    }),
  );
  await writeFile(path.join(archived, "report.md"), "archive before\n");
  await writeFile(
    path.join(archived, "tasks.md"),
    "- [x] First task\n- [ ] Second task\n- [X] Third task\n",
  );

  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "TUI test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "tui@example.invalid"], {
    cwd: root,
  });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "fixture baseline"], {
    cwd: root,
  });
  await writeFile(path.join(active, "proposal.md"), "after line\n");
  await writeFile(path.join(active, "untracked.md"), "untracked new\n");
  await writeFile(path.join(archived, "report.md"), "archive after\n");
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("Changes filters, reads files safely, shows Git HEAD diff, and escapes back to the list", async () => {
  const root = await fixture();
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change"), change("other-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 110, height: 36 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressKey("/"));
    await press(setup, () => setup.mockInput.typeText("target"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(
      setup,
      (frame) =>
        frame.includes("target-change") && !frame.includes("other-change"),
    );

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
    const binary = await waitForFrame(setup, (frame) =>
      frame.includes("binary or is not valid UTF-8 text"),
    );
    expect(binary).toContain("target-change/binary.dat");

    await press(setup, () => setup.mockInput.pressEscape());
    await waitForFrame(
      setup,
      (frame) => frame.includes("proposal.md") && !frame.includes("UTF-8"),
    );
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("after line"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    const diff = await waitForFrame(
      setup,
      (frame) =>
        frame.includes("- before line") && frame.includes("+ after line"),
    );
    expect(diff).toContain("target-change/proposal.md");

    await press(setup, () => setup.mockInput.pressEscape());
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("untracked new"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    const addition = await waitForFrame(setup, (frame) =>
      frame.includes("+ untracked new"),
    );
    expect(addition).toContain("untracked new");

    await press(setup, () => setup.mockInput.pressEscape());
    detail = await waitForFrame(
      setup,
      (frame) =>
        frame.includes("untracked.md") && !frame.includes("+ untracked new"),
    );
    expect(detail).toContain("untracked.md");
    await press(setup, () => setup.mockInput.pressEscape());
    const back = await waitForFrame(
      setup,
      (frame) =>
        frame.includes("Changes | List") &&
        frame.includes("target-change") &&
        !frame.includes("other-change"),
    );
    expect(back).toContain("READ ONLY");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Changes resolves details only when selected, refreshes edited detail, and surfaces errors", async () => {
  const root = await fixture();
  const reads: string[] = [];
  let requestRefresh = () => {};
  const Harness = () => {
    const [refreshVersion, setRefreshVersion] = useState(0);
    requestRefresh = () => setRefreshVersion((value) => value + 1);
    return (
      <Changes
        root={root}
        changes={[change("target-change"), change("other-change")]}
        refreshVersion={refreshVersion}
        loadDetail={async (name) => {
          const priorReads = reads.filter(
            (candidate) => candidate === name,
          ).length;
          reads.push(name);
          if (name === "other-change")
            throw new Error("private OpenSpec failure");
          return {
            ...change(name),
            status: priorReads === 0 ? "in-progress" : "updated",
          };
        }}
      />
    );
  };
  const setup = await testRender(<Harness />, { width: 100, height: 24 });
  try {
    await setup.renderOnce();
    expect(reads).toEqual([]);
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("schema-v1"));
    expect(reads).toEqual(["target-change"]);
    await act(async () => {
      requestRefresh();
      await Bun.sleep(30);
      await setup.renderOnce();
    });
    await waitForFrame(setup, (frame) => frame.includes("updated"));
    expect(reads).toEqual(["target-change", "target-change"]);
    await press(setup, () => setup.mockInput.pressEscape());
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    const failed = await waitForFrame(setup, (frame) =>
      frame.includes("Change detail read failed"),
    );
    expect(failed).toContain("safely.");
    expect(failed).not.toContain("private OpenSpec failure");
    expect(reads).toEqual(["target-change", "target-change", "other-change"]);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Changes distinguishes an empty list from a filter with no matches", async () => {
  const root = await fixture();
  const empty = await testRender(
    <Changes
      root={root}
      changes={[]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 80, height: 20 },
  );
  let emptyFrame = "";
  try {
    await empty.renderOnce();
    emptyFrame = empty.captureCharFrame();
    expect(emptyFrame).not.toContain("target-change");
  } finally {
    act(() => empty.renderer.destroy());
  }

  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 80, height: 20 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressKey("/"));
    await press(setup, () => setup.mockInput.typeText("missing"));
    await press(setup, () => setup.mockInput.pressEnter());
    const noMatches = await waitForFrame(
      setup,
      (frame) => frame.includes("missing") && !frame.includes("target-change"),
    );
    const withoutQuery = (frame: string) =>
      frame
        .split("\n")
        .filter((row) => !row.includes("missing") && !row.includes("(none)"))
        .join("\n");
    expect(withoutQuery(noMatches)).not.toBe(withoutQuery(emptyFrame));
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Changes remains navigable at compact terminal sizes", async () => {
  const root = await fixture();
  const longChangeName =
    "improve-opsx-read-performance-and-terminal-ux-integration";
  const longChangeDirectory = path.join(
    root,
    "openspec",
    "changes",
    longChangeName,
  );
  await mkdir(longChangeDirectory, { recursive: true });
  await writeFile(
    path.join(longChangeDirectory, ".openspec.yaml"),
    "schema: schema-v2\n",
  );
  await writeFile(
    path.join(longChangeDirectory, "proposal.md"),
    "after line\n" +
      Array.from({ length: 45 }, (_, index) => `retained line ${index}`).join(
        "\n",
      ),
  );
  for (const [width, height] of [
    [60, 18],
    [100, 32],
  ] as const) {
    const setup = await testRender(
      <Changes
        root={root}
        changes={[
          change(longChangeName, { complete: 11, total: 16, remaining: 5 }),
        ]}
        loadDetail={async (name) =>
          change(name, { complete: 11, total: 16, remaining: 5 })
        }
      />,
      { width, height },
    );
    try {
      await setup.renderOnce();
      const visibleIdentity = (frame: string) =>
        [1, 3].some((column) =>
          frame
            .split("\n")
            .map((line) => line.split("│")[column] ?? "")
            .join("")
            .replaceAll(/[█▀▄\s]/g, "")
            .includes(longChangeName),
        );
      expect(visibleIdentity(setup.captureCharFrame())).toBe(true);
      await press(setup, () => setup.mockInput.pressEnter());
      const detail = await waitForFrame(
        setup,
        (frame) => visibleIdentity(frame) && frame.includes(".openspec.yaml"),
      );
      await press(setup, () => setup.mockInput.pressArrow("down"));
      await waitForFrame(setup, (frame) => frame.includes("proposal.md"));
      if (width === 60) expect(detail).not.toContain("schema-v2");
      await press(setup, () => setup.mockInput.pressKey("m"));
      let summary = setup.captureCharFrame();
      for (let step = 0; step < 12 && !summary.includes("schema-v2"); step++) {
        await press(setup, () => setup.mockInput.pressArrow("down"));
        summary = setup.captureCharFrame();
      }
      expect(summary).toContain("schema-v2");
      const visibleSummary = (frame: string) =>
        frame
          .split("\n")
          .map((line) => line.split("│")[1] ?? "")
          .join("")
          .replaceAll(/[█▀▄\s]/g, "");
      await press(setup, () => setup.mockInput.pressKey("HOME"));
      summary = setup.captureCharFrame();
      for (
        let step = 0;
        step < 24 && !visibleSummary(summary).includes("11/16");
        step++
      ) {
        await press(setup, () => setup.mockInput.pressArrow("down"));
        summary = setup.captureCharFrame();
      }
      expect(visibleSummary(summary)).toContain("11/16");
      await press(setup, () => setup.mockInput.pressKey("f"));
      await press(setup, () => setup.mockInput.pressEnter());
      let file = await waitForFrame(
        setup,
        (frame) =>
          frame.includes("after line") && frame.includes("proposal.md"),
      );
      for (
        let step = 0;
        step < 50 && !file.includes("retained line 40");
        step++
      ) {
        await press(setup, () => setup.mockInput.pressArrow("down"));
        file = setup.captureCharFrame();
      }
      expect(file).toContain("retained line 40");
      await press(setup, () => setup.mockInput.pressEscape());
      await waitForFrame(
        setup,
        (frame) =>
          frame.includes("proposal.md") && !frame.includes("after line"),
      );
      await press(setup, () => setup.mockInput.pressEscape());
      await waitForFrame(
        setup,
        (frame) => frame.includes("List") && visibleIdentity(frame),
      );
    } finally {
      act(() => setup.renderer.destroy());
    }
  }
});

test("Archive browses historical provenance and diffs without treating records as active", async () => {
  const root = await fixture();
  const setup = await testRender(
    <Archive root={root} records={[{ name: "historical-change" }]} />,
    { width: 110, height: 36 },
  );
  try {
    await setup.renderOnce();
    const list = setup.captureCharFrame();
    expect(list).toContain("historical-change");
    await press(setup, () => setup.mockInput.pressEnter());
    const detail = await waitForFrame(setup, (frame) =>
      frame.includes("schema-v1"),
    );
    expect(detail).toContain("historical-change (not active)");
    expect(detail).toContain("historical; not active");
    expect(detail).toContain("current schema-v2");
    expect(detail).toContain("schema-v1 → schema-v2");
    expect(detail).toContain("report.md");
    expect(detail).toContain("Historical tasks: 2/3 · 1 remaining");
    expect(detail).not.toContain("Create change");
    expect(detail).not.toContain("Apply");
    await press(setup, () => setup.mockInput.pressKey("m"));
    let planning = setup.captureCharFrame();
    for (
      let step = 0;
      step < 15 &&
      !planning
        .replaceAll(/[│█▀▄\s]/g, "")
        .includes("artifactstatusunavailable;0planningfilesretained");
      step++
    ) {
      await press(setup, () => setup.mockInput.pressArrow("down"));
      planning = setup.captureCharFrame();
    }
    expect(planning.replaceAll(/[│█▀▄\s]/g, "")).toContain(
      "artifactstatusunavailable;0planningfilesretained",
    );
    await press(setup, () => setup.mockInput.pressKey("f"));

    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("archive after"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    const diff = await waitForFrame(
      setup,
      (frame) =>
        frame.includes("- archive before") && frame.includes("+ archive after"),
    );
    expect(diff).toContain("historical-change/report.md");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

function selectedFilename(frame: string) {
  return (
    frame
      .split("\n")
      .flatMap((row) => row.split("│"))
      .find((cell) => cell.includes("▸"))
      ?.split("▸")[1]
      ?.trim()
      .replace(/\s+[█▀▄]$/, "")
      .trim() ?? null
  );
}

test("file selection distinguishes an inside-act stale frame from the settled selection before Enter", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  await writeFile(path.join(active, "A.MARKDOWN"), "# Requested document\n");
  await writeFile(path.join(active, "Z.MD"), "# Wrong document\n");
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 100, height: 32 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("A.MARKDOWN"));
    await act(async () => {
      setup.mockInput.pressKey("f");
    });
    await setup.renderOnce();
    expect(selectedFilename(setup.captureCharFrame())).toBe(".openspec.yaml");
    let insideAct = "";
    await act(async () => {
      setup.mockInput.pressArrow("down");
      await Bun.sleep(30);
      await setup.renderOnce();
      insideAct = setup.captureCharFrame();
    });
    await setup.renderOnce();
    const settled = setup.captureCharFrame();
    console.log(
      "Selection control:",
      JSON.stringify({
        insideAct: selectedFilename(insideAct),
        settled: selectedFilename(settled),
      }),
    );
    expect(selectedFilename(insideAct)).toBe(".openspec.yaml");
    expect(selectedFilename(settled)).toBe("A.MARKDOWN");
    // Observe selected identity before opening, independently of the selection helper.
    expect(settled).not.toContain("▸ Z.MD");
    await act(async () => {
      setup.mockInput.pressEnter();
    });
    await setup.renderOnce();
    const opened = await waitForFrame(setup, (frame) =>
      frame.includes("Requested document"),
    );
    expect(opened).toContain("target-change/A.MARKDOWN");
    expect(opened).not.toContain("Wrong document");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

async function selectRetainedFile(setup: FrameSetup, filename: string) {
  // Narrow file lists initially show only the first rows, not necessarily the target.
  await waitForFrame(
    setup,
    (frame) => frame.includes("Files") && frame.includes("retained"),
  );
  await press(setup, () => setup.mockInput.pressKey("f"));
  for (let step = 0; step < 25; step++) {
    const selected = selectedFilename(setup.captureCharFrame())?.replaceAll(
      " / ",
      "/",
    );
    if (selected === filename) {
      expect(selected).toBe(filename);
      return;
    }
    await press(setup, () =>
      setup.mockInput.pressArrow(
        selected && selected > filename ? "up" : "down",
      ),
    );
  }
  throw new Error(
    "File selection did not reach " +
      filename +
      "\n" +
      setup.captureCharFrame(),
  );
}

async function openRetainedFile(setup: FrameSetup, filename: string) {
  await selectRetainedFile(setup, filename);
  await press(setup, () => setup.mockInput.pressEnter());
}

test("Markdown modes remember content across Diff and reset per file without extra content reads", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  await writeFile(
    path.join(active, "A.MARKDOWN"),
    "# Native heading\n- [x] passive checked\n- [ ] passive unchecked\n",
  );
  await writeFile(path.join(active, "Z.MD"), "## Other heading\n");
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 100, height: 32 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "A.MARKDOWN");
    let frame = await waitForFrame(setup, (value) =>
      value.includes("Native heading"),
    );
    expect(frame).toContain("[Document]");
    expect(frame).not.toContain("# Native heading");
    // Replacing bytes behind the already-read preview is a positive reread detector.
    await writeFile(path.join(active, "A.MARKDOWN"), "# externally replaced\n");
    await press(setup, () => setup.mockInput.pressKey("m"));
    frame = await waitForFrame(setup, (value) => value.includes("[Source]"));
    expect(frame).toContain("# Native heading");
    expect(frame).not.toContain("externally replaced");
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(
      setup,
      (value) =>
        value.includes("[Diff]") && value.includes("externally replaced"),
    );
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(setup, (value) => value.includes("[Source]"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(setup, (value) => value.includes("[Diff]"));
    await press(setup, () => setup.mockInput.pressKey("m"));
    await waitForFrame(setup, (value) => value.includes("[Document]"));
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(setup, (value) => value.includes("[Diff]"));
    await press(setup, () => setup.mockInput.pressKey("m"));
    await waitForFrame(setup, (value) => value.includes("[Source]"));
    await press(setup, () => setup.mockInput.pressEscape());
    await openRetainedFile(setup, "Z.MD");
    await waitForFrame(
      setup,
      (value) =>
        value.includes("[Document]") && value.includes("Other heading"),
    );
    await press(setup, () => setup.mockInput.pressEscape());
    await openRetainedFile(setup, "binary.dat");
    frame = await waitForFrame(setup, (value) => value.includes("UTF-8"));
    expect(frame).toContain("[Source]");
    expect(frame).not.toContain("Document");
    expect(frame).not.toContain("m source");
    await press(setup, () => setup.mockInput.pressKey("m"));
    expect(setup.captureCharFrame()).toBe(frame);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

async function documentSnapshot(
  directory: string,
): Promise<Record<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await documentSnapshot(path.join(directory, entry.name));
      for (const [name, digest] of Object.entries(nested))
        result[entry.name + "/" + name] = digest;
    } else if (entry.isFile()) {
      result[entry.name] = createHash("sha256")
        .update(await readFile(path.join(directory, entry.name)))
        .digest("hex");
    }
  }
  return result;
}

function scrollNodes(node: BaseRenderable): ScrollBoxRenderable[] {
  return [
    ...(node instanceof ScrollBoxRenderable ? [node] : []),
    ...node.getChildren().flatMap(scrollNodes),
  ];
}

test("Markdown and Source share a sanitized passive bounded preview without navigation writes", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  const content =
    "# Safe title\n- [x] already checked\n- [ ] still unchecked\n\n[remote guide](https://example.invalid/reader)\n\n␛ literal prefix\n\x1b]52;c;clipboard\x07\n\x1b[2J\n\n" +
    Array.from(
      { length: 150 },
      (_, index) => "bounded-line-" + String(index).padStart(3, "0"),
    ).join("\n");
  await writeFile(path.join(active, "safe.md"), content);
  await writeFile(
    path.join(active, "tasks.md"),
    "- [x] Existing task\n- [ ] Retained task\n",
  );
  const before = await documentSnapshot(path.join(root, "openspec"));
  const reads = spyOn(archiveReads, "boundedFile");
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 100, height: 32 },
  );
  try {
    setRendererCapabilities(setup.renderer, { hyperlinks: true });
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "safe.md");
    const first = await waitForFrame(
      setup,
      (frame) => frame.includes("Safe title") && frame.includes("clipboard"),
    );
    expect(first).toContain("[x]");
    expect(first).toContain("[ ]");
    expect(first).toContain("https://example.invalid/reader");
    expect(first).toContain("␛]52;c;clipboard�");
    expect(first).toContain("␛[2J");
    expect(first).toContain("Preview truncated");
    expect(
      [...setup.renderer.currentRenderBuffer.buffers.attributes]
        .map(getLinkId)
        .every((id) => id === 0),
    ).toBe(true);
    const count = reads.mock.calls.filter(
      ([, file]) => file === "safe.md",
    ).length;
    expect(count).toBe(1);
    await press(setup, () => setup.mockInput.pressEnter());
    await press(setup, () => setup.mockInput.pressKey(" "));
    await press(setup, () => setup.mockMouse.click(4, 7));
    expect(setup.captureCharFrame()).toBe(first);
    await press(setup, () => setup.mockInput.pressKey("END"));
    const bottom = setup.captureCharFrame();
    expect(bottom).toContain("Preview truncated");
    expect(bottom).toContain("target-change/safe.md");
    expect(bottom).not.toContain("bounded-line-149");
    await press(setup, () => setup.mockInput.pressKey("m"));
    let source = await waitForFrame(
      setup,
      (frame) => frame.includes("[Source]") && frame.includes("# Safe title"),
    );
    expect(source).toContain("␛]52;c;clipboard�");
    expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(0);
    await press(setup, () => setup.mockInput.pressKey("END"));
    source = setup.captureCharFrame();
    expect(source).toContain("bounded-line-109"); // 10 header lines + 110 body lines = 120-line limit
    expect(source).not.toContain("bounded-line-110");
    expect(source).not.toContain("bounded-line-149");
    expect(source).toContain("Preview truncated");
    await press(setup, () => setup.mockInput.pressKey("m"));
    await waitForFrame(
      setup,
      (frame) => frame.includes("[Document]") && frame.includes("Safe title"),
    );
    expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(0);
    expect(
      reads.mock.calls.filter(([, file]) => file === "safe.md"),
    ).toHaveLength(count);
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(
      setup,
      (frame) =>
        frame.includes("[Diff]") && frame.includes("Preview truncated"),
    );
    await press(setup, () => setup.mockInput.pressEscape());
    expect(selectedFilename(setup.captureCharFrame())).toBe("safe.md");
    await press(setup, () => setup.mockInput.pressEscape());
    expect(await documentSnapshot(path.join(root, "openspec"))).toEqual(before);
  } finally {
    reads.mockRestore();
    act(() => setup.renderer.destroy());
  }
});

test("file pending, empty and read-error states remain explicit with Source available", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  await writeFile(path.join(active, "pending.md"), "# After pending\n");
  await writeFile(path.join(active, "empty.md"), "");
  await writeFile(
    path.join(active, "invalid.md"),
    new Uint8Array([0xc3, 0x28]),
  );
  const actualRead = archiveReads.boundedFile;
  let finishRead: (value: Awaited<ReturnType<typeof boundedFile>>) => void =
    () => {};
  const deferred = new Promise<Awaited<ReturnType<typeof boundedFile>>>(
    (resolve) => {
      finishRead = resolve;
    },
  );
  const reads = spyOn(archiveReads, "boundedFile").mockImplementation(
    (directory, file) =>
      file === "pending.md" ? deferred : actualRead(directory, file),
  );
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "pending.md");
    let frame = await waitForFrame(setup, (value) =>
      value.includes("Reading bounded"),
    );
    expect(frame).toContain("[Document]");
    expect(frame).not.toContain("File read failed");
    await press(setup, () => setup.mockInput.pressKey("m"));
    frame = setup.captureCharFrame();
    expect(frame).toContain("[Source]");
    expect(frame).toContain("Reading bounded");
    expect(
      reads.mock.calls.filter(([, file]) => file === "pending.md"),
    ).toHaveLength(1);
    const resolvedFile = await actualRead(active, "pending.md");
    await act(async () => {
      finishRead(resolvedFile);
    });
    await waitForFrame(setup, (value) => value.includes("# After pending"));
    await press(setup, () => setup.mockInput.pressEscape());
    await openRetainedFile(setup, "empty.md");
    frame = await waitForFrame(setup, (value) =>
      value.includes("File is empty."),
    );
    expect(frame).toContain("[Document]");
    expect(frame).not.toContain("failed");
    await press(setup, () => setup.mockInput.pressKey("m"));
    expect(setup.captureCharFrame()).toContain("File is empty.");
    await press(setup, () => setup.mockInput.pressEscape());
    await openRetainedFile(setup, "invalid.md");
    frame = await waitForFrame(setup, (value) =>
      value.replaceAll(/[│█▀▄\s]/g, "").includes("UTF-8"),
    );
    expect(frame.replaceAll(/[│█▀▄\s]/g, "")).toContain(
      "ThisfileisbinaryorisnotvalidUTF-8text.",
    );
    expect(frame).toContain("File read failed:");
    expect(frame).not.toContain(root);
    expect(frame).not.toContain("File is empty.");
    await press(setup, () => setup.mockInput.pressKey("m"));
    expect(setup.captureCharFrame()).toContain("[Source]");
    const sourceError = await waitForFrame(
      setup,
      (value) =>
        value.includes("[Source]") &&
        value
          .replaceAll(/[│█▀▄\s]/g, "")
          .includes("ThisfileisbinaryorisnotvalidUTF-8text."),
    );
    expect(sourceError.replaceAll(/[│█▀▄\s]/g, "")).toContain(
      "ThisfileisbinaryorisnotvalidUTF-8text.",
    );
  } finally {
    reads.mockRestore();
    act(() => setup.renderer.destroy());
  }
});

test("rendering limitation is distinct from a read failure and leaves safe Source available", async () => {
  const root = await fixture();
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await selectRetainedFile(setup, "proposal.md");
    const style = spyOn(SyntaxStyle, "fromStyles").mockImplementation(() => {
      throw new Error("controlled native render failure");
    });
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      await press(setup, () => setup.mockInput.pressEnter());
      const frame = await waitForFrame(setup, (value) =>
        value.includes("Document rendering unavailable"),
      );
      expect(frame).toContain("Press m for safe Source");
      expect(frame).not.toContain("File read failed");
      expect(frame).not.toContain("File is empty.");
    } finally {
      style.mockRestore();
      errors.mockRestore();
    }
    await press(setup, () => setup.mockInput.pressKey("m"));
    const source = await waitForFrame(
      setup,
      (value) => value.includes("[Source]") && value.includes("after line"),
    );
    expect(source).not.toContain("Document rendering unavailable");
    await press(setup, () => setup.mockInput.pressKey("m"));
    const recovered = await waitForFrame(
      setup,
      (value) => value.includes("[Document]") && value.includes("after line"),
    );
    expect(recovered).not.toContain("unavailable");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("unsafe paths and a post-list symlink substitution retain the trusted refusal", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  const outside = path.join(root, "outside.md");
  await writeFile(outside, "SECRET OUTSIDE CONTENT");
  await writeFile(path.join(active, "swap.md"), "# Before swap\n");
  await symlink(outside, path.join(active, "omitted.md"));
  for (const target of [
    "../outside.md",
    outside,
    "nested/../outside.md",
    "nested\\outside.md",
  ]) {
    await expect(boundedFile(active, target)).rejects.toMatchObject({
      code: "UNSAFE_PATH",
    });
  }
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 100, height: 32 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    const detail = await waitForFrame(setup, (frame) =>
      frame.includes("swap.md"),
    );
    expect(detail).not.toContain("omitted.md");
    await selectRetainedFile(setup, "swap.md");
    await rm(path.join(active, "swap.md"));
    await symlink(outside, path.join(active, "swap.md"));
    await press(setup, () => setup.mockInput.pressEnter());
    let frame = await waitForFrame(setup, (value) =>
      value.includes("outside the selected change"),
    );
    expect(frame).toContain("[Document]");
    expect(frame).not.toContain("SECRET OUTSIDE");
    expect(frame).not.toContain(root);
    await press(setup, () => setup.mockInput.pressKey("m"));
    frame = setup.captureCharFrame();
    expect(frame).toContain("[Source]");
    expect(frame).toContain("outside the selected change");
    expect(frame).not.toContain("SECRET OUTSIDE");
    await press(setup, () => setup.mockInput.pressKey("d"));
    frame = await waitForFrame(
      setup,
      (value) =>
        value.includes("[Diff]") &&
        value.includes("outside the selected change"),
    );
    expect(frame).not.toContain("SECRET OUTSIDE");
    expect(await readFile(outside, "utf8")).toBe("SECRET OUTSIDE CONTENT");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("archive retains size refusal, passive bounded Markdown and historical read-only modes", async () => {
  const root = await fixture();
  const archived = path.join(
    root,
    "openspec",
    "changes",
    "archive",
    "historical-change",
  );
  await writeFile(path.join(archived, "large.md"), "x".repeat(1024 * 1024 + 1));
  await writeFile(
    path.join(archived, "passive.MD"),
    "# Archived title\n- [x] historical checked\n- [ ] historical unchecked\n[kept](https://example.invalid/archive)\n",
  );
  await expect(
    archivedFile(root, "historical-change", "large.md"),
  ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  const before = await documentSnapshot(path.join(root, "openspec"));
  const setup = await testRender(
    <Archive root={root} records={[{ name: "historical-change" }]} />,
    { width: 100, height: 32 },
  );
  try {
    setRendererCapabilities(setup.renderer, { hyperlinks: true });
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "large.md");
    let frame = await waitForFrame(setup, (value) =>
      value.includes("1 MiB read limit"),
    );
    expect(frame).toContain("[Document]");
    expect(frame).toContain("HISTORICAL");
    expect(frame).toContain("READ ONLY");
    expect(frame).not.toContain(root);
    await press(setup, () => setup.mockInput.pressKey("m"));
    expect(setup.captureCharFrame()).toContain("[Source]");
    expect(setup.captureCharFrame()).toContain("1 MiB read limit");
    await press(setup, () => setup.mockInput.pressEscape());
    await openRetainedFile(setup, "passive.MD");
    frame = await waitForFrame(
      setup,
      (value) => value.includes("Archived title") && value.includes("[x]"),
    );
    expect(frame).toContain("[Document]");
    expect(frame).toContain("[ ]");
    expect(frame).toContain("https://example.invalid/archive");
    expect(
      [...setup.renderer.currentRenderBuffer.buffers.attributes]
        .map(getLinkId)
        .every((id) => id === 0),
    ).toBe(true);
    await press(setup, () => setup.mockInput.pressEnter());
    await press(setup, () => setup.mockInput.pressKey(" "));
    expect(setup.captureCharFrame()).toBe(frame);
    await press(setup, () => setup.mockInput.pressKey("m"));
    expect(setup.captureCharFrame()).toContain("# Archived title");
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(
      setup,
      (value) =>
        value.includes("[Diff]") && value.includes("historical checked"),
    );
    await press(setup, () => setup.mockInput.pressKey("d"));
    expect(setup.captureCharFrame()).toContain("[Source]");
    await press(setup, () => setup.mockInput.pressEscape());
    expect(selectedFilename(setup.captureCharFrame())).toBe("passive.MD");
    expect(await documentSnapshot(path.join(root, "openspec"))).toEqual(before);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Git unchanged, missing HEAD, inspection failure and oversized comparison stay distinct", async () => {
  for (const state of [
    "unchanged",
    "missing-head",
    "inspection-error",
    "oversized",
  ] as const) {
    const root = await fixture();
    const active = path.join(root, "openspec", "changes", "target-change");
    if (state === "missing-head")
      await rename(path.join(root, ".git"), path.join(root, ".git-held"));
    if (state === "inspection-error")
      await writeFile(
        path.join(root, ".git", "index"),
        "controlled corrupt index",
      );
    if (state === "oversized")
      await writeFile(
        path.join(active, "proposal.md"),
        "# Visible safe prefix\n" + "bounded comparison line\n".repeat(20_000),
      );
    const setup = await testRender(
      <Changes
        root={root}
        changes={[change("target-change")]}
        loadDetail={async (name) => change(name)}
      />,
      { width: 100, height: 32 },
    );
    try {
      await setup.renderOnce();
      await press(setup, () => setup.mockInput.pressEnter());
      await openRetainedFile(
        setup,
        state === "unchanged" ? ".openspec.yaml" : "proposal.md",
      );
      await waitForFrame(setup, (frame) =>
        frame.includes(
          state === "unchanged"
            ? "schema: schema-v2"
            : state === "oversized"
              ? "Visible safe prefix"
              : "after line",
        ),
      );
      await press(setup, () => setup.mockInput.pressKey("d"));
      const message =
        state === "unchanged"
          ? "No changes from Git HEAD"
          : state === "missing-head"
            ? "No Git HEAD baseline"
            : state === "inspection-error"
              ? "Git could not inspect this file safely."
              : "The Git diff exceeds the 256 KiB read limit.";
      const frame = await waitForFrame(setup, (value) =>
        value.includes(message),
      );
      expect(frame).toContain("[Diff]");
      expect(frame).not.toContain("File is empty.");
      expect(frame).not.toContain(root);
      await press(setup, () => setup.mockInput.pressKey("d"));
      expect(setup.captureCharFrame()).toContain(
        state === "unchanged" ? "[Source]" : "[Document]",
      );
    } finally {
      act(() => setup.renderer.destroy());
    }
  }
});

test("Esc retains filtered item and file identity while detail m keeps summary ownership", async () => {
  const root = await fixture();
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change"), change("other-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 100, height: 32 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressKey("/"));
    await press(setup, () => setup.mockInput.typeText("target"));
    await press(setup, () => setup.mockInput.pressEnter());
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "proposal.md");
    await waitForFrame(
      setup,
      (frame) => frame.includes("[Document]") && frame.includes("after line"),
    );
    await press(setup, () => setup.mockInput.pressKey("m"));
    await press(setup, () => setup.mockInput.pressEscape());
    let detail = setup.captureCharFrame();
    expect(selectedFilename(detail)).toBe("proposal.md");
    expect(detail).toContain("m summary");
    await press(setup, () => setup.mockInput.pressKey("m"));
    detail = setup.captureCharFrame();
    expect(detail).toContain("f files");
    expect(detail).not.toContain("source/document");
    expect(detail).not.toContain("[Document]");
    await press(setup, () => setup.mockInput.pressKey("f"));
    expect(selectedFilename(setup.captureCharFrame())).toBe("proposal.md");
    await press(setup, () => setup.mockInput.pressEscape());
    const list = setup.captureCharFrame();
    expect(list).toContain("Filter: target");
    expect(list).toContain("target-change");
    expect(list).not.toContain("other-change");
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(
      setup,
      (frame) => frame.includes("Files") && frame.includes("retained"),
    );
    // Entry remains the requested item. Opening another detail session may reset the file.
    expect(setup.captureCharFrame()).toContain("target-change");
    expect(setup.captureCharFrame()).not.toContain("other-change");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("reader global keys stay on the shared stream without changing local mode or scroll", async () => {
  const root = await fixture();
  const seen: Array<{ name: string; shift: boolean }> = [];
  function GlobalKeyProbe() {
    useKeyboard((event) => {
      if (
        event.name === "tab" ||
        ["1", "2", "3", "4", "?"].includes(event.name)
      ) {
        seen.push({ name: event.name, shift: event.shift });
      }
    });
    return (
      <Changes
        root={root}
        changes={[change("target-change")]}
        loadDetail={async (name) => change(name)}
      />
    );
  }
  const setup = await testRender(<GlobalKeyProbe />, {
    width: 100,
    height: 32,
  });
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "proposal.md");
    const before = await waitForFrame(
      setup,
      (frame) => frame.includes("[Document]") && frame.includes("after line"),
    );
    const top = scrollNodes(setup.renderer.root)[0]!.scrollTop;
    await press(setup, () => setup.mockInput.pressTab());
    await press(setup, () => setup.mockInput.pressTab({ shift: true }));
    for (const key of ["1", "2", "3", "4", "?"])
      await press(setup, () => setup.mockInput.pressKey(key));
    expect(seen).toEqual([
      { name: "tab", shift: false },
      { name: "tab", shift: true },
      ...["1", "2", "3", "4", "?"].map((name) => ({ name, shift: false })),
    ]);
    expect(setup.captureCharFrame()).toBe(before);
    expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(top);
    await press(setup, () => setup.mockInput.pressKey("m"));
    expect(setup.captureCharFrame()).toContain("[Source]");
    await press(setup, () => setup.mockInput.pressKey("d"));
    await waitForFrame(setup, (frame) => frame.includes("[Diff]"));
    expect(seen).toHaveLength(7);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("long identities, bounded prefixes, scroll reset and resize stay readable in static modes", async () => {
  const root = await fixture();
  const name = "long-change-identity-with-retained-read-only-document-context";
  const file = "long-markdown-artifact-identity-for-a-truncated-preview.md";
  const active = path.join(root, "openspec", "changes", name);
  await mkdir(active, { recursive: true });
  await writeFile(
    path.join(active, file),
    "# Start of bounded document\n\n" +
      Array.from(
        { length: 180 },
        (_, index) => "static-line-" + String(index).padStart(3, "0"),
      ).join("\n"),
  );
  const previousColor = process.env.NO_COLOR;
  const previousMotion = process.env.REDUCED_MOTION;
  process.env.NO_COLOR = "1";
  process.env.REDUCED_MOTION = "1";
  try {
    for (const [width, height] of [
      [100, 32],
      [60, 18],
    ] as const) {
      const setup = await testRender(
        <Changes
          root={root}
          changes={[change(name)]}
          loadDetail={async (item) => change(item)}
        />,
        { width, height },
      );
      try {
        await setup.renderOnce();
        await press(setup, () => setup.mockInput.pressEnter());
        await waitForFrame(setup, (frame) => frame.includes("1 retained"));
        // Only one retained file. Its full name can wrap over multiple rows.
        await press(setup, () => setup.mockInput.pressEnter());
        let frame = await waitForFrame(setup, (value) =>
          value.includes("Start of bounded document"),
        );
        expect(frame).toContain("[Document]");
        expect(frame).toContain("…");
        expect(frame).toContain("preview.md");
        expect(frame).toContain("READ ONLY");
        expect(frame).toContain("Preview truncated");
        expect(frame).toContain("Esc detail");
        const staticFrame = frame;
        await act(async () => {
          await Bun.sleep(100);
        });
        await setup.renderOnce();
        expect(setup.captureCharFrame()).toBe(staticFrame);
        await press(setup, () => setup.mockInput.pressKey("END"));
        frame = setup.captureCharFrame();
        expect(frame).toContain("static-line-117");
        expect(frame).not.toContain("static-line-118");
        expect(frame).toContain("preview.md");
        expect(frame).toContain("Preview truncated");
        await press(setup, () => setup.mockInput.pressKey("m"));
        frame = await waitForFrame(
          setup,
          (value) =>
            value.includes("[Source]") && value.includes("# Start of bounded"),
        );
        expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(0);
        await press(setup, () => setup.mockInput.pressKey("d"));
        await waitForFrame(
          setup,
          (value) =>
            value.includes("[Diff]") && value.includes("Preview truncated"),
        );
        await press(setup, () => setup.mockInput.pressKey("d"));
        await waitForFrame(
          setup,
          (value) =>
            value.includes("[Source]") && value.includes("# Start of bounded"),
        );
        expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(0);
        await act(async () => {
          setup.resize(width === 100 ? 60 : 100, width === 100 ? 18 : 32);
        });
        await setup.renderOnce();
        frame = setup.captureCharFrame();
        expect(frame).toContain("[Source]");
        expect(frame).toContain("Esc detail");
        expect(frame).toContain("Preview truncated");
        expect(frame).toContain("# Start of bounded");
        await press(setup, () => setup.mockInput.pressEscape());
        await press(setup, () => setup.mockInput.pressKey("m"));
        await press(setup, () => setup.mockInput.pressKey("home"));
        const detailIdentity = setup
          .captureCharFrame()
          .replaceAll(/[│█▀▄\s]/g, "");
        expect(detailIdentity).toContain(name);
      } finally {
        act(() => setup.renderer.destroy());
      }
    }
  } finally {
    if (previousColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previousColor;
    if (previousMotion === undefined) delete process.env.REDUCED_MOTION;
    else process.env.REDUCED_MOTION = previousMotion;
  }
});

test("bounded previews ending in fences, tables and lists keep the same partial Source", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  const cases = [
    {
      name: "fence.md",
      prefix: "# Bounded fence\n```text\n",
      row: (index: string) => "fence-row-" + index,
      last: 117,
      suffix: "\n```\nLATER FULL CONTENT",
    },
    {
      name: "table.md",
      prefix: "# Bounded table\n\n| Row | Value |\n| --- | --- |\n",
      row: (index: string) => "| table-row-" + index + " | kept |",
      last: 115,
      suffix: "\nLATER FULL CONTENT",
    },
    {
      name: "list.md",
      prefix: "# Bounded list\n\n",
      row: (index: string) => "- [x] list-row-" + index,
      last: 117,
      suffix: "\nLATER FULL CONTENT",
    },
  ];
  for (const item of cases) {
    await writeFile(
      path.join(active, item.name),
      item.prefix +
        Array.from({ length: 150 }, (_, index) =>
          item.row(String(index).padStart(3, "0")),
        ).join("\n") +
        item.suffix,
    );
  }
  const reads = spyOn(archiveReads, "boundedFile");
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    for (const item of cases) {
      await openRetainedFile(setup, item.name);
      await waitForFrame(
        setup,
        (frame) =>
          frame.includes("[Document]") && frame.includes("Preview truncated"),
      );
      await press(setup, () => setup.mockInput.pressKey("END"));
      expect(setup.captureCharFrame()).toContain("Preview truncated");
      expect(setup.captureCharFrame()).not.toContain("LATER FULL CONTENT");
      await press(setup, () => setup.mockInput.pressKey("m"));
      await waitForFrame(
        setup,
        (frame) =>
          frame.includes("[Source]") &&
          frame.includes(item.prefix.split("\n")[0]!),
      );
      await press(setup, () => setup.mockInput.pressKey("END"));
      const source = setup.captureCharFrame();
      expect(source).toContain(item.row(String(item.last).padStart(3, "0")));
      expect(source).not.toContain(
        item.row(String(item.last + 1).padStart(3, "0")),
      );
      expect(source).not.toContain("LATER FULL CONTENT");
      expect(source).toContain("Preview truncated");
      expect(
        reads.mock.calls.filter(([, file]) => file === item.name),
      ).toHaveLength(1);
      await press(setup, () => setup.mockInput.pressEscape());
      const detail = await waitForFrame(
        setup,
        (frame) => selectedFilename(frame) === item.name,
      );
      expect(selectedFilename(detail)).toBe(item.name);
    }
  } finally {
    reads.mockRestore();
    act(() => setup.renderer.destroy());
  }
});

test("native plainText represents JSX children and manual content after the settled lifecycle", async () => {
  const expected = "Native text control\nSame buffered content";
  const setup = await testRender(
    <box flexDirection="column">
      <text id="jsx-text-control" wrapMode="char">
        {expected}
      </text>
      <text id="manual-text-control" wrapMode="char" content={expected} />
    </box>,
    { width: 60, height: 18 },
  );
  try {
    await press(setup, () => {});
    const jsx = setup.renderer.root.findDescendantById("jsx-text-control");
    const manual = setup.renderer.root.findDescendantById(
      "manual-text-control",
    );
    if (
      !(jsx instanceof TextRenderable) ||
      !(manual instanceof TextRenderable)
    ) {
      throw new Error(
        "Settled text controls were not native TextRenderable nodes.",
      );
    }
    const observed = {
      jsxChunks: jsx.chunks.map((chunk) => chunk.text).join(""),
      manualChunks: manual.chunks.map((chunk) => chunk.text).join(""),
      jsxPlainText: jsx.plainText,
      manualPlainText: manual.plainText,
    };
    console.log("Native text positive control:", JSON.stringify(observed));
    expect(observed.jsxChunks).toBe("");
    expect(observed.manualChunks).toBe(expected);
    expect(observed.jsxPlainText).toBe(expected);
    expect(observed.manualPlainText).toBe(expected);
    expect(observed.jsxPlainText).toHaveLength(expected.length);
    expect(observed.manualPlainText).toHaveLength(expected.length);
    // The native count omits line separators; plainText includes them.
    expect(jsx.textLength).toBe(expected.replaceAll("\n", "").length);
    expect(manual.textLength).toBe(expected.replaceAll("\n", "").length);
    expect(setup.captureCharFrame()).toContain("Native text control");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("native refusal clipping control distinguishes first paint from settled exact bytes", async () => {
  const refusal =
    "File read failed: This file is binary or is not valid UTF-8 text.";
  const observations: Record<string, { initial: string; settled: string }> = {};
  for (const constraint of ["auto", "100%"] as const) {
    const setup = await testRender(
      <scrollbox width={58} height={6}>
        <text id="refusal-control" width={constraint} wrapMode="word">
          {refusal}
        </text>
      </scrollbox>,
      { width: 60, height: 18 },
    );
    try {
      await setup.renderOnce();
      const node = setup.renderer.root.findDescendantById("refusal-control");
      if (!(node instanceof TextRenderable))
        throw new Error("Native refusal control missing");
      expect(node.plainText).toBe(refusal);
      const scroll = scrollNodes(setup.renderer.root)[0]!;
      const initial = setup.captureCharFrame().replaceAll(/[█\s]/g, "");
      for (
        let frame = 0;
        frame < 8 && scroll.viewport.width !== node.width;
        frame++
      ) {
        await setup.renderOnce();
      }
      await setup.renderOnce();
      observations[constraint] = {
        initial,
        settled: setup.captureCharFrame().replaceAll(/[█\s]/g, ""),
      };
      expect(scroll.viewport.width).toBe(node.width);
    } finally {
      act(() => setup.renderer.destroy());
    }
  }
  console.log("Native refusal clipping control", JSON.stringify(observations));
  for (const observation of Object.values(observations)) {
    expect(observation.initial).not.toContain("UTF-8");
    expect(observation.settled).toContain(refusal.replaceAll(/\s/g, ""));
  }
});

test("native ScrollBox remount requires laid-out range and row coordinates before selection", async () => {
  const setup = await createTestRenderer({ width: 60, height: 18 });
  const scroll = new ScrollBoxRenderable(setup.renderer, {
    id: "native-file-control",
    width: 56,
    height: 2,
  });
  for (let index = 0; index < 5; index++) {
    scroll.add(
      new TextRenderable(setup.renderer, {
        id: "native-row-" + index,
        content: "row " + index,
        flexShrink: 0,
      }),
    );
  }
  setup.renderer.root.add(scroll);
  try {
    scroll.scrollChildIntoView("native-row-2");
    const early = {
      viewport: scroll.viewport.height,
      row: scroll.content.findDescendantById("native-row-2")?.height,
      range: scroll.scrollHeight,
      scrollTop: scroll.scrollTop,
    };
    await setup.renderOnce();
    const child = scroll.content.findDescendantById("native-row-2")!;
    const laidOut = {
      viewport: scroll.viewport.height,
      row: child.height,
      range: scroll.scrollHeight,
      scrollTop: scroll.scrollTop,
    };
    console.log(
      "Native pre/post-layout control",
      JSON.stringify({ early, laidOut }),
    );
    expect(early.viewport).toBe(0);
    expect(early.row).toBe(0);
    expect(early.scrollTop).toBe(0);
    expect(laidOut.viewport).toBe(2);
    expect(laidOut.row).toBe(1);
    expect(laidOut.range).toBe(5);
    expect(laidOut.scrollTop).toBe(0);
    expect(child.y).toBeGreaterThanOrEqual(
      scroll.viewport.y + scroll.viewport.height,
    );
    setup.renderer.once("frame", () =>
      scroll.scrollChildIntoView("native-row-2"),
    );
    await setup.renderOnce();
    await setup.renderOnce();
    expect(scroll.scrollTop).toBe(1);
    expect(child.y).toBeGreaterThanOrEqual(scroll.viewport.y);
    expect(child.y + child.height).toBeLessThanOrEqual(
      scroll.viewport.y + scroll.viewport.height,
    );
    expect(setup.captureCharFrame()).toContain("row 2");
    // Native size-change callbacks still maintain the range when content grows.
    scroll.add(
      new TextRenderable(setup.renderer, { content: "row 5", flexShrink: 0 }),
    );
    await setup.renderOnce();
    expect(scroll.scrollHeight).toBe(6);
  } finally {
    setup.renderer.destroy();
  }
});

function selectionGeometry(scroll: ScrollBoxRenderable, setup: FrameSetup) {
  const rows = scroll.content.getChildren().map((row) => {
    const text = row
      .getChildren()
      .find((child) => child instanceof TextRenderable);
    return {
      id: row.id,
      text: text instanceof TextRenderable ? text.plainText : null,
      y: row.y,
      height: row.height,
    };
  });
  return {
    focus: setup.renderer.currentFocusedRenderable?.id,
    viewport: { y: scroll.viewport.y, height: scroll.viewport.height },
    content: { y: scroll.content.y, height: scroll.content.height },
    scrollTop: scroll.scrollTop,
    scrollHeight: scroll.scrollHeight,
    range:
      scroll.verticalScrollBar.scrollSize -
      scroll.verticalScrollBar.viewportSize,
    rows,
  };
}

test.each([
  [60, 18],
  [100, 32],
])("native file selection survives arrows, reader remount and resize %ix%i", async (width, height) => {
  const root = await fixture();
  await writeFile(
    path.join(root, "openspec/changes/target-change/chars.md"),
    "# Selected native target\n",
  );
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width, height },
  );
  const files = () => {
    const scroll = scrollNodes(setup.renderer.root).find((node) =>
      node.content.findDescendantById("browser-file-row-0"),
    );
    if (!scroll) throw new Error("Native files ScrollBox missing");
    return scroll;
  };
  const assertSelection = () => {
    const scroll = files();
    const observed = selectionGeometry(scroll, setup);
    const selected = observed.rows.find((row) => row.text === "▸ chars.md");
    expect(selectedFilename(setup.captureCharFrame())).toBe("chars.md");
    expect(observed.focus).toBe(scroll.id);
    expect(selected?.id).toBe("browser-file-row-2");
    expect(selected!.height).toBe(1);
    expect(selected!.y).toBeGreaterThanOrEqual(observed.viewport.y);
    expect(selected!.y + selected!.height).toBeLessThanOrEqual(
      observed.viewport.y + observed.viewport.height,
    );
    expect(observed.scrollHeight).toBe(observed.content.height);
  };
  try {
    await setup.renderOnce();
    const baselineListeners = setup.renderer.listenerCount("frame");
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("retained"));
    const initial = files();
    const selectionListener = setup.renderer.listeners("frame").at(-1);
    expect(setup.renderer.listenerCount("frame")).toBe(baselineListeners + 1);
    // fixture order: .openspec.yaml, binary.dat, chars.md, proposal.md, untracked.md.
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressArrow("down"));
    assertSelection();
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) =>
      frame.includes("Selected native target"),
    );
    // Selection cleanup is still exact; file mode now owns one different
    // post-frame width listener, not the removed detail selection closure.
    expect(setup.renderer.listeners("frame")).not.toContain(selectionListener);
    expect(setup.renderer.listenerCount("frame")).toBe(baselineListeners + 1);
    const readerListener = setup.renderer.listeners("frame").at(-1);
    await press(setup, () => setup.mockInput.pressEscape());
    await waitForFrame(
      setup,
      (frame) => selectedFilename(frame) === "chars.md",
    );
    expect(setup.renderer.listeners("frame")).not.toContain(readerListener);
    expect(files()).not.toBe(initial);
    expect(initial.isDestroyed).toBe(true);
    assertSelection();
    expect(setup.renderer.listenerCount("frame")).toBe(baselineListeners + 1);
    const returnedScrollTop = files().scrollTop;
    for (let frame = 0; frame < 3; frame++) await setup.renderOnce();
    expect(files().scrollTop).toBe(returnedScrollTop);
    for (const [nextWidth, nextHeight] of [
      [width === 60 ? 100 : 60, width === 60 ? 32 : 18],
      [width, height],
    ]) {
      await act(async () => setup.resize(nextWidth!, nextHeight!));
      await waitForFrame(
        setup,
        (frame) => selectedFilename(frame) === "chars.md",
      );
      assertSelection();
    }
    await press(setup, () => setup.mockInput.pressEscape());
    expect(setup.renderer.listenerCount("frame")).toBe(baselineListeners);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("12,000-character safe previews remain bounded in both Markdown content modes", async () => {
  const root = await fixture();
  const active = path.join(root, "openspec", "changes", "target-change");
  const content =
    "# Character limit\n" + "x".repeat(12_000) + "AFTER-CHAR-LIMIT";
  await writeFile(path.join(active, "chars.md"), content);
  const reads = spyOn(archiveReads, "boundedFile");
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) => change(name)}
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "chars.md");
    await waitForFrame(
      setup,
      (frame) =>
        frame.includes("Character limit") &&
        frame.includes("Preview truncated"),
    );
    await press(setup, () => setup.mockInput.pressKey("m"));
    await waitForFrame(
      setup,
      (frame) =>
        frame.includes("[Source]") && frame.includes("# Character limit"),
    );
    const source = setup.renderer.root.findDescendantById(
      "reader-source-preview",
    );
    if (!(source instanceof TextRenderable)) {
      throw new Error(
        "Settled Source preview is not the identified native text node.",
      );
    }
    expect(
      scrollNodes(setup.renderer.root)[0]!.content.findDescendantById(
        "reader-source-preview",
      ),
    ).toBe(source);
    // The documented native buffer getter reflects JSX children, unlike chunks.
    const expected = boundedPreview(content).text;
    expect(expected).toHaveLength(12_000);
    expect(source.plainText).toBe(expected);
    expect(source.plainText).toBe(content.slice(0, 12_000));
    expect(source.plainText).toHaveLength(12_000);
    expect(source.textLength).toBe(expected.replaceAll("\n", "").length);
    expect(source.plainText).not.toContain("AFTER-CHAR-LIMIT");
    await press(setup, () => setup.mockInput.pressKey("END"));
    const bottom = setup.captureCharFrame();
    expect(bottom).toContain("Preview truncated");
    expect(bottom).not.toContain("AFTER-CHAR-LIMIT");
    expect(
      reads.mock.calls.filter(([, file]) => file === "chars.md"),
    ).toHaveLength(1);
  } finally {
    reads.mockRestore();
    act(() => setup.renderer.destroy());
  }
});

test("integrated context leads with exact tasks in detail and every reader mode", async () => {
  const root = await fixture();
  for (const [checked, total] of [
    [0, 10],
    [1, 10],
    [9, 10],
    [10, 10],
    [99, 100],
    [0, 0],
  ]) {
    const loaded = change("target-change", {
      complete: checked!,
      total: total!,
      remaining: total! - checked!,
    });
    const setup = await testRender(
      <Changes
        root={root}
        changes={[loaded]}
        loadDetail={async () => loaded}
      />,
      { width: 100, height: 32 },
    );
    try {
      await setup.renderOnce();
      await press(setup, () => setup.mockInput.pressEnter());
      const detail = await waitForFrame(
        setup,
        (frame) => frame.includes("Files") && frame.includes("retained"),
      );
      expect(detail).toContain(`Tasks: ${checked}/${total}`);
      expect(detail.indexOf("Tasks:")).toBeLessThan(
        detail.indexOf("Planning:"),
      );
      await openRetainedFile(setup, "proposal.md");
      await waitForFrame(setup, (frame) => frame.includes("after line"));
      for (const key of ["m", "d", "d"]) {
        await press(setup, () => setup.mockInput.pressKey(key));
        const frame = await waitForFrame(
          setup,
          (frame) => !frame.includes("Reading bounded"),
        );
        expect(frame).toContain(`Tasks: ${checked}/${total}`);
        expect(frame).toContain("Planning: 2/2 artifacts ready");
        if (total === 0) {
          expect(frame).toContain("No checklist tasks");
          expect(frame).not.toMatch(/\[[=-]+\]/);
        } else {
          expect(frame).toContain(`${total! - checked!} remaining`);
          expect(frame).toContain(
            checked === total
              ? "[======]"
              : checked === 99 || checked === 9
                ? "[=====-]"
                : "[------]",
          );
        }
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  }
});

test("context request survives detail-to-file and refresh cancels late results without hiding content", async () => {
  const root = await fixture();
  const pending: Array<{
    resolve: (value: DetailedChange) => void;
    reject: (error: Error) => void;
  }> = [];
  const loadDetail = () =>
    new Promise<DetailedChange>((resolve, reject) =>
      pending.push({ resolve, reject }),
    );
  let refresh = () => {};
  function Harness() {
    const [version, setVersion] = useState(0);
    refresh = () => setVersion((previous) => previous + 1);
    return (
      <Changes
        root={root}
        changes={[change("target-change")]}
        loadDetail={loadDetail}
        refreshVersion={version}
      />
    );
  }
  const setup = await testRender(<Harness />, { width: 100, height: 32 });
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "proposal.md");
    let frame = await waitForFrame(setup, (current) =>
      current.includes("after line"),
    );
    expect(frame).toContain("Tasks: Loading");
    expect(pending).toHaveLength(1);
    await press(setup, refresh);
    expect(pending).toHaveLength(2);
    await press(setup, () =>
      pending[0]!.resolve(
        change("target-change", { complete: 10, total: 10, remaining: 0 }),
      ),
    );
    frame = setup.captureCharFrame();
    expect(frame).toContain("Tasks: Loading");
    expect(frame).not.toContain("10/10");
    await press(setup, () =>
      pending[1]!.reject(new Error("private context error")),
    );
    frame = await waitForFrame(setup, (current) =>
      current.includes("after line"),
    );
    expect(frame).toContain("Tasks: Unavailable");
    expect(frame).not.toContain("private context error");
    await writeFile(
      path.join(root, "openspec/changes/target-change/proposal.md"),
      "# Refreshed content\n",
    );
    await press(setup, refresh);
    await press(setup, () =>
      pending[2]!.resolve(
        change("target-change", { complete: 99, total: 100, remaining: 1 }),
      ),
    );
    frame = await waitForFrame(setup, (current) =>
      current.includes("Refreshed content"),
    );
    expect(frame).toContain("99/100");
    expect(frame).not.toContain("after line");
    await press(setup, () => setup.mockInput.pressEscape());
    expect(pending).toHaveLength(3);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("changing selection during delayed context never leaks another record or mismatched detail", async () => {
  const root = await fixture();
  const pending: Array<{
    name: string;
    resolve: (value: DetailedChange) => void;
  }> = [];
  const loadDetail = (name: string) =>
    new Promise<DetailedChange>((resolve) => pending.push({ name, resolve }));
  let refresh = () => {};
  function Harness() {
    const [version, setVersion] = useState(0);
    refresh = () => setVersion((value) => value + 1);
    return (
      <Changes
        root={root}
        changes={[change("target-change"), change("other-change")]}
        loadDetail={loadDetail}
        refreshVersion={version}
      />
    );
  }
  const setup = await testRender(<Harness />, { width: 100, height: 32 });
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await waitForFrame(setup, (frame) => frame.includes("retained"));
    expect(pending.map((request) => request.name)).toEqual(["target-change"]);
    await press(setup, () => setup.mockInput.pressEscape());
    await press(setup, () => setup.mockInput.pressArrow("down"));
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "proposal.md");
    let frame = await waitForFrame(setup, (value) =>
      value.includes("other change"),
    );
    expect(frame).toContain("Tasks: Loading");
    expect(pending.map((request) => request.name)).toEqual([
      "target-change",
      "other-change",
    ]);
    await press(setup, () =>
      pending[1]!.resolve(
        change("other-change", { complete: 9, total: 10, remaining: 1 }),
      ),
    );
    await press(setup, () =>
      pending[0]!.resolve(
        change("target-change", { complete: 100, total: 100, remaining: 0 }),
      ),
    );
    frame = await waitForFrame(setup, (value) => value.includes("9/10"));
    expect(frame).toContain("other-change/proposal.md");
    expect(frame).toContain("other change");
    expect(frame).not.toContain("100/100");
    expect(frame).not.toContain("target-change");
    await press(setup, refresh);
    expect(pending[2]!.name).toBe("other-change");
    await press(setup, () =>
      pending[2]!.resolve(
        change("target-change", { complete: 10, total: 10, remaining: 0 }),
      ),
    );
    frame = await waitForFrame(
      setup,
      (value) =>
        value.includes("Tasks: Unavailable") && value.includes("other change"),
    );
    expect(frame).toContain("other change");
    expect(frame).not.toContain("10/10");
    expect(frame).not.toContain("9/10");
    expect(frame).not.toContain("target-change");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("failed file content retains the selected record's valid task context", async () => {
  const root = await fixture();
  const setup = await testRender(
    <Changes
      root={root}
      changes={[change("target-change")]}
      loadDetail={async (name) =>
        change(name, { complete: 9, total: 10, remaining: 1 })
      }
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "binary.dat");
    const frame = await waitForFrame(setup, (value) =>
      value.includes("File read failed"),
    );
    expect(frame).toContain("target-change/binary.dat");
    expect(frame).toContain("[Source]");
    expect(frame).toContain("Tasks: 9/10");
    expect(frame).toContain("1 remaining");
    expect(frame).toContain("Planning: 2/2 artifacts ready");
    expect(frame).not.toContain("Tasks: Unavailable");
    expect(frame).not.toContain("100%");
    expect(frame).not.toContain(root);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("archive reader refresh cancels historical task results without inventing planning readiness", async () => {
  const root = await fixture();
  const directory = path.join(
    root,
    "openspec/changes/archive/historical-change",
  );
  const nativeRead = archiveReads.archivedFile;
  let deferTasks = false;
  let resolveOld:
    | ((value: Awaited<ReturnType<typeof archivedFile>>) => void)
    | undefined;
  const reads = spyOn(archiveReads, "archivedFile").mockImplementation(
    (...args) => {
      if (deferTasks && args[2] === "tasks.md") {
        deferTasks = false;
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      return nativeRead(...args);
    },
  );
  let refresh = () => {};
  function Harness() {
    const [version, setVersion] = useState(0);
    refresh = () => setVersion((value) => value + 1);
    return (
      <Archive
        root={root}
        records={[{ name: "historical-change" }]}
        refreshVersion={version}
      />
    );
  }
  const setup = await testRender(<Harness />, { width: 100, height: 32 });
  try {
    await setup.renderOnce();
    await press(setup, () => setup.mockInput.pressEnter());
    await openRetainedFile(setup, "report.md");
    let frame = await waitForFrame(setup, (value) =>
      value.includes("archive after"),
    );
    expect(frame).toContain("Historical tasks: 2/3");
    expect(frame).toContain("Historical planning: Unknown");
    expect(frame).not.toContain("artifacts ready");
    const oldTasks = await nativeRead(root, "historical-change", "tasks.md");
    deferTasks = true;
    await press(setup, refresh);
    frame = await waitForFrame(
      setup,
      (value) =>
        value.includes("Historical tasks: Loading") &&
        value.includes("archive after"),
    );
    expect(resolveOld).toBeDefined();
    expect(frame).toContain("archive after");
    expect(frame).not.toContain("2/3");
    await writeFile(
      path.join(directory, "tasks.md"),
      "- [x] Current historical task\n",
    );
    await writeFile(
      path.join(directory, "report.md"),
      "# Refreshed historical content\n",
    );
    await press(setup, refresh);
    frame = await waitForFrame(
      setup,
      (value) =>
        value.includes("Refreshed historical content") &&
        value.includes("Historical tasks: 1/1"),
    );
    await press(setup, () => resolveOld!(oldTasks));
    frame = setup.captureCharFrame();
    expect(frame).toContain("Historical tasks: 1/1");
    expect(frame).toContain("Refreshed historical content");
    expect(frame).not.toContain("2/3");
    expect(frame).not.toContain("archive after");
    expect(frame).toContain("HISTORICAL");
    expect(frame).toContain("READ ONLY");
    expect(frame).not.toContain("artifacts ready");
  } finally {
    reads.mockRestore();
    act(() => setup.renderer.destroy());
  }
});

for (const archived of [false, true]) {
  test(`settled refreshed ${archived ? "archive" : "active"} inventory opens its highlighted replacement file`, async () => {
    for (const [width, height] of [
      [60, 18],
      [100, 32],
    ]) {
      const root = await fixture();
      const name = archived ? "historical-change" : "target-change";
      const directory = path.join(
        root,
        "openspec/changes",
        ...(archived ? ["archive", name] : [name]),
      );
      await writeFile(
        path.join(directory, "chosen.md"),
        "# Removed selected file\n",
      );
      let refresh = () => {};
      function Harness() {
        const [refreshVersion, setRefreshVersion] = useState(0);
        refresh = () => setRefreshVersion((value) => value + 1);
        return archived ? (
          <Archive
            root={root}
            records={[{ name }]}
            refreshVersion={refreshVersion}
          />
        ) : (
          <Changes
            root={root}
            changes={[change(name)]}
            loadDetail={async () => change(name)}
            refreshVersion={refreshVersion}
          />
        );
      }
      const setup = await testRender(<Harness />, {
        width: width!,
        height: height!,
      });
      try {
        await setup.renderOnce();
        await press(setup, () => setup.mockInput.pressEnter());
        await selectRetainedFile(setup, "chosen.md");
        await rm(path.join(directory, "chosen.md"));
        await press(setup, refresh);
        await waitForFrame(
          setup,
          (frame) => selectedFilename(frame) === ".openspec.yaml",
        );
        const settled = setup.captureCharFrame();
        expect(settled).not.toContain("chosen.md");
        expect(selectedFilename(settled)).toBe(".openspec.yaml");
        await press(setup, () => setup.mockInput.pressEnter());
        const opened = await waitForFrame(
          setup,
          (frame) =>
            frame.includes("schema: schema-v2") ||
            frame.includes("File read failed"),
        );
        expect(opened).toContain(name + "/.openspec.yaml");
        expect(opened).toContain("[Source]");
        expect(opened).toContain("schema: schema-v2");
        expect(opened).not.toContain("chosen.md");
        expect(opened).not.toContain("File read failed");
      } finally {
        act(() => setup.renderer.destroy());
      }
    }
  });

  test(`refresh keeps an already-open ${archived ? "archive" : "active"} reader anchored when its file vanishes`, async () => {
    const root = await fixture();
    const name = archived ? "historical-change" : "target-change";
    const directory = path.join(
      root,
      "openspec/changes",
      ...(archived ? ["archive", name] : [name]),
    );
    await writeFile(
      path.join(directory, "chosen.md"),
      "# Retained reader identity\n",
    );
    let refresh = () => {};
    function Harness() {
      const [refreshVersion, setRefreshVersion] = useState(0);
      refresh = () => setRefreshVersion((value) => value + 1);
      return archived ? (
        <Archive
          root={root}
          records={[{ name }]}
          refreshVersion={refreshVersion}
        />
      ) : (
        <Changes
          root={root}
          changes={[change(name)]}
          loadDetail={async () => change(name)}
          refreshVersion={refreshVersion}
        />
      );
    }
    const setup = await testRender(<Harness />, { width: 100, height: 32 });
    try {
      await setup.renderOnce();
      await press(setup, () => setup.mockInput.pressEnter());
      await openRetainedFile(setup, "chosen.md");
      await waitForFrame(setup, (frame) =>
        frame.includes("Retained reader identity"),
      );
      await rm(path.join(directory, "chosen.md"));
      await press(setup, refresh);
      const refused = await waitForFrame(setup, (frame) =>
        frame.includes("File read failed"),
      );
      expect(refused).toContain(name + "/chosen.md");
      expect(refused).toContain("[Document]");
      expect(refused).not.toContain("schema: schema-v2");
      await press(setup, () => setup.mockInput.pressEscape());
      await waitForFrame(
        setup,
        (frame) => selectedFilename(frame) === ".openspec.yaml",
      );
      await press(setup, () => setup.mockInput.pressEnter());
      const next = await waitForFrame(
        setup,
        (frame) =>
          frame.includes("schema: schema-v2") ||
          frame.includes("File read failed"),
      );
      expect(next).toContain(name + "/.openspec.yaml");
      expect(next).toContain("schema: schema-v2");
      expect(next).not.toContain("chosen.md");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
}

for (const [initialWidth, initialHeight] of [
  [60, 18],
  [100, 32],
]) {
  test(`bounded native Document and Source expose their readable suffix at End and resize from ${initialWidth} columns`, async () => {
    const root = await fixture();
    const content =
      "# Bounded native preview\n" + "x".repeat(12_000) + "AFTER-SAFE-LIMIT";
    await writeFile(
      path.join(root, "openspec/changes/target-change/truncated.md"),
      content,
    );
    const before = await documentSnapshot(path.join(root, "openspec"));
    const reads = spyOn(archiveReads, "boundedFile");
    const setup = await testRender(
      <Changes
        root={root}
        changes={[
          change("target-change", { complete: 99, total: 100, remaining: 1 }),
        ]}
        loadDetail={async (name) =>
          change(name, { complete: 99, total: 100, remaining: 1 })
        }
      />,
      { width: initialWidth!, height: initialHeight! },
    );
    try {
      await setup.renderOnce();
      const baseline = setup.renderer.listenerCount("frame");
      await press(setup, () => setup.mockInput.pressEnter());
      await openRetainedFile(setup, "truncated.md");
      await waitForFrame(setup, (frame) =>
        frame.includes("Bounded native preview"),
      );
      for (const mode of ["Document", "Source"]) {
        if (mode === "Source") {
          await press(setup, () => setup.mockInput.pressKey("m"));
          await waitForFrame(setup, (frame) => frame.includes("[Source]"));
          expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(0);
        }
        for (const [width, height] of [
          [initialWidth, initialHeight],
          [initialWidth === 60 ? 100 : 60, initialHeight === 18 ? 32 : 18],
          [initialWidth, initialHeight],
        ]) {
          await act(async () => setup.resize(width!, height!));
          await setup.renderOnce();
          const previewLeaves = (
            node: BaseRenderable,
          ): (CodeRenderable | TextRenderable)[] => [
            ...(node instanceof CodeRenderable ||
            (node instanceof TextRenderable &&
              node.id === "reader-source-preview")
              ? [node]
              : []),
            ...node.getChildren().flatMap(previewLeaves),
          ];
          // An input before native wrap settlement legitimately uses the old
          // range. Require real native dimensions, not a fixed delay, before End.
          await waitForFrame(setup, () => {
            const scroll = scrollNodes(setup.renderer.root)[0]!;
            const leaves = previewLeaves(scroll);
            return (
              scroll.width === width! - 2 &&
              leaves.length > 0 &&
              leaves.every(
                (node) =>
                  node.width === scroll.viewport.width &&
                  node.height === node.virtualLineCount,
              )
            );
          });
          await press(setup, () => setup.mockInput.pressKey("END"));
          for (let frame = 0; frame < 12; frame++) await setup.renderOnce();
          const scroll = scrollNodes(setup.renderer.root)[0]!;
          const captured = setup.captureCharFrame();
          const body = captured
            .split("\n")
            .slice(
              scroll.viewport.y,
              scroll.viewport.y + scroll.viewport.height,
            )
            .join("\n");
          expect(body).toContain("xxxxxxxx");
          expect(captured).toContain("[" + mode + "]");
          expect(captured).toContain("target-change/truncated.md");
          expect(captured).toContain("99/100");
          expect(captured).toContain("Preview truncated");
          expect(captured).not.toContain("AFTER-SAFE-LIMIT");
          expect(scroll.scrollTop).toBe(
            Math.max(0, scroll.scrollHeight - scroll.viewport.height),
          );
          expect(scroll.scrollHeight).toBe(scroll.content.height);
          const stableTop = scroll.scrollTop;
          for (let frame = 0; frame < 3; frame++) await setup.renderOnce();
          expect(scroll.scrollTop).toBe(stableTop);
          if (mode === "Source") {
            const source = setup.renderer.root.findDescendantById(
              "reader-source-preview",
            );
            expect(source).toBeInstanceOf(TextRenderable);
            expect((source as TextRenderable).width).toBe(
              scroll.viewport.width,
            );
            expect((source as TextRenderable).plainText).toBe(
              boundedPreview(content).text,
            );
          }
        }
      }
      // Document/Source and resize share one bounded content read. Diff retains
      // the existing comparison read and fresh content read on the round trip.
      expect(
        reads.mock.calls.filter(([, file]) => file === "truncated.md"),
      ).toHaveLength(1);
      const sourceListener = setup.renderer.listeners("frame").at(-1);
      expect(setup.renderer.listenerCount("frame")).toBe(baseline + 1);
      await press(setup, () => setup.mockInput.pressKey("d"));
      await waitForFrame(setup, (frame) => frame.includes("[Diff]"));
      expect(setup.renderer.listenerCount("frame")).toBe(baseline);
      expect(setup.renderer.listeners("frame")).not.toContain(sourceListener);
      await press(setup, () => setup.mockInput.pressKey("d"));
      await waitForFrame(setup, (frame) => frame.includes("[Source]"));
      expect(scrollNodes(setup.renderer.root)[0]!.scrollTop).toBe(0);
      expect(setup.renderer.listenerCount("frame")).toBe(baseline + 1);
      expect(
        reads.mock.calls.filter(([, file]) => file === "truncated.md"),
      ).toHaveLength(3);
      expect(await documentSnapshot(path.join(root, "openspec"))).toEqual(
        before,
      );
      await press(setup, () => setup.mockInput.pressEscape());
      await press(setup, () => setup.mockInput.pressEscape());
      expect(setup.renderer.listenerCount("frame")).toBe(baseline);
    } finally {
      reads.mockRestore();
      act(() => setup.renderer.destroy());
    }
  });
}

test("read-model bounds previews and reports safe errors without leaking paths", () => {
  const preview = planningLabel({ ready: 0, total: 0, complete: null });
  const bounded = boundedPreview(
    Array.from({ length: 150 }, (_, index) => `line ${index}`).join("\n"),
    12_000,
    20,
  );
  const error = safeReadError({
    code: "FILE_TOO_LARGE",
    message: "/private/project/secret.bin is too large",
  });
  expect(preview).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
  expect(preview).not.toMatch(/\b\d+(?:\.\d+)?%/);
  expect(bounded.truncated).toBe(true);
  expect(bounded.text).toContain("line 19");
  expect(bounded.text).not.toContain("line 20");
  expect(error).toBe("This file exceeds the 1 MiB read limit.");
  expect(error).not.toContain("private/project");
});
