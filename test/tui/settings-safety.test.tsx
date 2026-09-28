import { afterEach, expect, test } from "bun:test";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type {
  ChangeSummary,
  ProjectSnapshot,
} from "../../src/domain/snapshot.ts";
import { listBundledSchemas } from "../../src/bundled/index.ts";
import { OpenSpecClient } from "../../src/openspec/client.ts";
import {
  loadAgentProfiles,
  skillInstallHostLabel,
  SKILL_INSTALL_HOST_IDS,
} from "../../src/resources/index.ts";
import { resolveRevision } from "../../src/revisions/index.ts";
import { previewMcpInstall } from "../../src/mcp/index.ts";
import { apply, preview } from "../../src/switch/index.ts";
import type { SwitchRequest } from "../../src/switch/index.ts";
import { Settings } from "../../src/tui/settings.tsx";

const fixtures: string[] = [];
type FrameSetup = Awaited<ReturnType<typeof testRender>>;
const fixtureProvider = "fixture-provider";
const fixtureUrl = "https://fixture.invalid/mcp";
const fixtureCatalog = (url: string) =>
  `version: 1\nservers:\n  - name: ${fixtureProvider}\n    url: ${url}\n    readOnly: true\n    auth: none\n`;

async function withTTY<T>(tty: boolean, action: () => Promise<T>): Promise<T> {
  const streams = [process.stdin, process.stdout];
  const descriptors = streams.map((stream) =>
    Object.getOwnPropertyDescriptor(stream, "isTTY"),
  );
  for (const stream of streams)
    Object.defineProperty(stream, "isTTY", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: tty,
    });
  try {
    return await action();
  } finally {
    streams.forEach((stream, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(stream, "isTTY", descriptor);
      else Reflect.deleteProperty(stream, "isTTY");
    });
  }
}

async function fixture(changes: readonly ChangeSummary[] = []) {
  const root = await mkdtemp(path.join(tmpdir(), "opsx-settings-safety-"));
  fixtures.push(root);
  await mkdir(path.join(root, "openspec", "changes"), { recursive: true });
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  const client = new OpenSpecClient(root);
  const defaultRevision = await resolveRevision(client, "spec-driven");
  const schemaDir = path.join(root, "openspec", "schemas", "fixture-schema");
  await cp(defaultRevision.source, schemaDir, { recursive: true });
  await writeFile(path.join(schemaDir, "mcp.yaml"), fixtureCatalog(fixtureUrl));
  await writeFile(
    path.join(root, "openspec", "config.yaml"),
    "schema: fixture-schema\n",
  );
  const snapshot: Pick<ProjectSnapshot, "defaultSchema" | "schemas"> & {
    changes: readonly ChangeSummary[];
  } = {
    defaultSchema: "fixture-schema",
    schemas: [{ name: "fixture-schema", source: schemaDir }],
    changes,
  };
  return { root, schemaDir, snapshot };
}

async function press(setup: FrameSetup, key: string) {
  await act(async () => {
    if (key === "up" || key === "down") await setup.mockInput.pressArrow(key);
    else if (key === "escape") {
      setup.mockInput.pressEscape();
      await Bun.sleep(50);
    } else if (key === "enter") setup.mockInput.pressEnter();
    else setup.mockInput.pressKey(key === "space" ? " " : key);
    await setup.flush();
    await setup.renderOnce();
    await setup.waitForVisualIdle();
  });
}

async function waitForFrame(
  setup: FrameSetup,
  predicate: (frame: string) => boolean,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    let frame = "";
    await act(async () => {
      await setup.renderOnce();
      await Bun.sleep(30);
      frame = setup.captureCharFrame();
    });
    if (predicate(frame)) return frame;
  }
  throw new Error(
    `Timed out waiting for Settings frame.\n${setup.captureCharFrame()}`,
  );
}

async function selectedRow(setup: FrameSetup): Promise<string> {
  const focused = setup.renderer.root.findDescendantById(
    "settings-focused-row",
  ) as unknown as { content?: { chunks?: Array<{ text: string }> } } | null;
  return focused?.content?.chunks?.map((chunk) => chunk.text).join("") ?? "";
}

async function expectFocusedRowVisible(setup: FrameSetup) {
  expect(await selectedRow(setup)).toContain("Atomic skills");
  await waitForFrame(setup, (value) =>
    value
      .split("\n")
      .some((line) => line.includes("Atomic skills") && /\[[ x]\]/.test(line)),
  );
}

async function focusRow(
  setup: FrameSetup,
  label: string,
  direction: "up" | "down" = "down",
) {
  let previous = "";
  for (let attempt = 0; attempt < 50; attempt++) {
    const current = await selectedRow(setup);
    if (current.includes(label)) return;
    if (current === previous) await Bun.sleep(100);
    previous = current;
    await press(setup, direction);
  }
  throw new Error(
    `Could not focus Settings row ${label}.\n${setup.captureCharFrame()}`,
  );
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(
    fixtures
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

test(
  "all five native skill hosts are separate staged choices and never write during review",
  async () => {
    const { root, snapshot } = await fixture();
    const before = (await readdir(root, { recursive: true })).sort();
    const setup = await testRender(
      <Settings root={root} snapshot={snapshot} onRefresh={() => {}} active />,
      { width: 60, height: 18 },
    );
    try {
      await setup.renderOnce();
      for (const host of SKILL_INSTALL_HOST_IDS) {
        await focusRow(setup, skillInstallHostLabel(host) + " skills");
        await press(setup, "space");
      }
      await press(setup, "r");
      let frame = await waitForFrame(setup, (value) =>
        value.includes("Skill-install hosts"),
      );
      const hostRoots = [
        ".opencode/skills",
        ".omp/skills",
        ".pi/skills",
        ".atomic/skills",
        ".senpi/skills",
      ];
      let reviewed = frame;
      for (
        let i = 0;
        i < 80 &&
        hostRoots.some(
          (root) =>
            !reviewed
              .replaceAll(/[│┌┐└┘─]/g, "")
              .replaceAll(/\s+/g, "")
              .includes(root),
        );
        i++
      ) {
        await press(setup, "down");
        frame = setup.captureCharFrame();
        reviewed += "\n" + frame;
      }
      const normalizedReview = reviewed
        .replaceAll(/[│┌┐└┘─]/g, "")
        .replaceAll(/\s+/g, " ");
      const compactReview = normalizedReview.replaceAll(/\s+/g, "");
      for (const root of hostRoots) expect(compactReview).toContain(root);
      expect(normalizedReview).toContain("trust external");
      expect(normalizedReview).toContain("Opsx cannot verify or grant it.");
      expect((await readdir(root, { recursive: true })).sort()).toEqual(before);
    } finally {
      act(() => setup.renderer.destroy());
    }
  },
  { timeout: 30_000 },
);

test(
  "focused host choice remains visible after async discovery and terminal resize",
  async () => {
    const { root, snapshot } = await fixture();
    const setup = await testRender(
      <Settings root={root} snapshot={snapshot} onRefresh={() => {}} active />,
      { width: 100, height: 32 },
    );
    try {
      await setup.renderOnce();
      await focusRow(setup, "Atomic skills");
      await waitForFrame(setup, (frame) =>
        frame.includes("Focused: Atomic skills"),
      );
      await expectFocusedRowVisible(setup);

      await act(async () => {
        setup.resize(60, 18);
        await setup.flush();
        await setup.renderOnce();
        await setup.waitForVisualIdle();
      });
      await waitForFrame(setup, (frame) =>
        frame.includes("Focused: Atomic skills"),
      );
      await expectFocusedRowVisible(setup);

      await act(async () => {
        setup.resize(100, 32);
        await setup.flush();
        await setup.renderOnce();
        await setup.waitForVisualIdle();
      });
      await waitForFrame(setup, (frame) =>
        frame.includes("Focused: Atomic skills"),
      );
      await expectFocusedRowVisible(setup);
    } finally {
      act(() => setup.renderer.destroy());
    }
  },
  { timeout: 30_000 },
);

test(
  "installed host targets and later drift remain distinct in Settings recovery view",
  async () => {
    const { root, schemaDir, snapshot } = await fixture();
    const name = "fixture-host-skill";
    const sourceRoot = path.join(root, "source");
    const sourceSkill = path.join(sourceRoot, ".agents", "skills", name);
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(
      path.join(sourceSkill, "SKILL.md"),
      `---\nname: ${name}\ndescription: Local host fixture.\n---\n\n# Host skill\n`,
    );
    await writeFile(path.join(schemaDir, "skills.txt"), `${name}\n`);
    const request: SwitchRequest = {
      schema: "fixture-schema",
      profiles: [],
      migrations: [],
      skillHosts: ["omp", "atomic"],
    };
    const options = { sourceRoots: { "intent-driven-dev/skills": sourceRoot } };
    const plan = await preview(root, request, options);
    expect(plan.canApply).toBe(true);
    expect(
      plan.skillHosts
        .flatMap((host) => host.targets)
        .map((target) => target.action),
    ).toEqual(["install", "install"]);
    const result = await apply(root, request, plan.token, options);
    expect(result.status).toBe("applied");
    const ompTarget = path.join(root, ".omp", "skills", name, "SKILL.md");
    const atomicTarget = path.join(root, ".atomic", "skills", name, "SKILL.md");
    expect(await readFile(ompTarget, "utf8")).toBe(
      await readFile(atomicTarget, "utf8"),
    );

    async function resultFrame() {
      const setup = await testRender(
        <Settings
          root={root}
          snapshot={snapshot}
          onRefresh={() => {}}
          active
        />,
        { width: 100, height: 32 },
      );
      await setup.renderOnce();
      return setup;
    }
    const complete = await resultFrame();
    try {
      const frame = await waitForFrame(complete, (value) =>
        value.includes("Overall: Applied"),
      );
      expect(frame).not.toContain("Focused:");
      expect(frame).not.toContain("Stage selections, then preview");
      expect(frame).not.toContain("Recovery Needed");
    } finally {
      act(() => complete.renderer.destroy());
    }

    await writeFile(atomicTarget, "# Changed after Apply\n");
    const changed = await resultFrame();
    try {
      let frame = await waitForFrame(changed, (value) =>
        value.includes("Overall: Completed previously; current targets differ"),
      );
      for (
        let index = 0;
        index < 30 && !frame.includes("Changed Since Apply | skills.install |");
        index++
      ) {
        await press(changed, "down");
        frame = changed.captureCharFrame();
      }
      expect(frame).toContain("Changed Since Apply | skills.install |");
      expect(frame).not.toContain("No recovery is required");
      expect(await readFile(ompTarget, "utf8")).toContain("# Host skill");
    } finally {
      act(() => changed.renderer.destroy());
    }
  },
  { timeout: 60_000 },
);

test(
  "interrupted host Apply shows observed writes without reporting overall success",
  async () => {
    const { root, schemaDir, snapshot } = await fixture();
    const name = "interrupted-host-skill";
    const sourceRoot = path.join(root, "source");
    const sourceSkill = path.join(sourceRoot, ".agents", "skills", name);
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(
      path.join(sourceSkill, "SKILL.md"),
      `---\nname: ${name}\ndescription: Interrupted host fixture.\n---\n\n# Installed skill\n`,
    );
    await writeFile(path.join(schemaDir, "skills.txt"), `${name}\n`);
    const request: SwitchRequest = {
      schema: "fixture-schema",
      profiles: [],
      migrations: [],
      skillHosts: ["atomic"],
    };
    const options = {
      sourceRoots: { "intent-driven-dev/skills": sourceRoot },
      afterBoundary: async (boundary: string) => {
        if (boundary === "skills.install")
          throw new Error("interrupted after host write");
      },
    };
    const plan = await preview(root, request, options);
    const result = await apply(root, request, plan.token, options);
    expect(result.status).toBe("partial");
    expect(
      await readFile(
        path.join(root, ".atomic", "skills", name, "SKILL.md"),
        "utf8",
      ),
    ).toContain("# Installed skill");

    const setup = await testRender(
      <Settings root={root} snapshot={snapshot} onRefresh={() => {}} active />,
      { width: 100, height: 32 },
    );
    try {
      await setup.renderOnce();
      let frame = await waitForFrame(setup, (value) =>
        value.includes("Overall: Recovery Needed"),
      );
      for (
        let index = 0;
        index < 30 && !frame.includes("Applied | skills.install |");
        index++
      ) {
        await press(setup, "down");
        frame = setup.captureCharFrame();
      }
      expect(frame).toContain("Applied | skills.install |");
      expect(frame).not.toContain("Overall: Applied");
    } finally {
      act(() => setup.renderer.destroy());
    }
  },
  { timeout: 60_000 },
);

test(
  "staged schema, profile, and migration names remain readable at narrow and standard TUI sizes",
  async () => {
    const longMigration = "wrap-heavy-migration-name-for-small-terminal-review";
    const summary: ChangeSummary = {
      name: longMigration,
      status: "in-progress",
      schema: "fixture-schema",
      artifacts: [],
      tasks: null,
    };
    const { root, snapshot } = await fixture([summary]);
    const profiles = await loadAgentProfiles();
    expect(profiles.length).toBeGreaterThan(0);
    const expectedProfile = profiles[0]!;
    const lastProfile = profiles[profiles.length - 1]!;
    const schemaNames = [
      ...new Set([
        ...listBundledSchemas(),
        ...snapshot.schemas.map((entry) => entry.name),
        snapshot.defaultSchema,
      ]),
    ].sort();

    for (const size of [
      { width: 60, height: 18 },
      { width: 100, height: 32 },
    ]) {
      const setup = await testRender(
        <Settings
          root={root}
          snapshot={snapshot}
          onRefresh={() => {}}
          active
        />,
        size,
      );
      try {
        await setup.renderOnce();
        await waitForFrame(setup, () =>
          Boolean(
            setup.renderer.root.findDescendantById(
              `settings-row-${schemaNames.length + profiles.length - 1}`,
            ),
          ),
        );
        await focusRow(setup, `Agent ${lastProfile.label}`);
        await focusRow(setup, `Agent ${expectedProfile.label}`, "up");
        await press(setup, "space");
        await focusRow(setup, "Migrate");
        await press(setup, "space");
        const stagedFrame = await waitForFrame(setup, (frame) =>
          frame.includes("[x] Migrate"),
        );
        expect(stagedFrame).toContain("[x] Migrate");
        expect(stagedFrame).toMatch(/(?:Migrations|M) 1/);
        const visibleList = stagedFrame
          .split("\n")
          .map((line) => line.split("│")[1] ?? "")
          .join("")
          .replaceAll(/[█▀▄\s]/g, "");
        expect(visibleList).toContain(longMigration);
        await press(setup, "r");
        let review = await waitForFrame(setup, (frame) =>
          frame.includes("Staged selections only"),
        );
        expect(review).toContain(`Default schema target: fixture-schema`);
        expect(review).toContain(
          `${expectedProfile.label} (${expectedProfile.id})`,
        );
        for (
          let index = 0;
          index < 20 && !review.replaceAll(/\s/g, "").includes(longMigration);
          index++
        ) {
          await press(setup, "down");
          review = setup.captureCharFrame();
        }
        expect(review.replaceAll(/\s/g, "")).toContain(longMigration);
      } finally {
        act(() => setup.renderer.destroy());
      }
    }
  },
  { timeout: 30_000 },
);

test(
  "Apply cancellation, MCP denial, and stale MCP preview perform no project writes",
  async () => {
    const { root, schemaDir, snapshot } = await fixture();
    const configPath = path.join(root, "openspec", "config.yaml");
    const originalConfig = await readFile(configPath, "utf8");
    const targetSchema = "spec-driven";
    const installed = await resolveRevision(
      new OpenSpecClient(root),
      targetSchema,
    );
    const visibleSnapshot = {
      ...snapshot,
      schemas: [
        ...snapshot.schemas,
        { name: targetSchema, source: installed.source },
      ],
    };
    const setup = await testRender(
      <Settings
        root={root}
        snapshot={visibleSnapshot}
        onRefresh={() => {}}
        active
      />,
      { width: 100, height: 32 },
    );
    try {
      await setup.renderOnce();
      await focusRow(setup, `Schema ${targetSchema}`);
      await press(setup, "space");
      await press(setup, "p");
      const preview = await waitForFrame(setup, (frame) =>
        frame.includes("Can apply: yes"),
      );
      expect(preview).toContain("Default schema: fixture-schema →");
      expect(preview).toContain("Schema:");
      expect(preview).toContain("Exact skill target effects:");
      await press(setup, "a");
      const confirmation = await waitForFrame(setup, (frame) =>
        frame.includes("Apply confirmation — exact effects to write:"),
      );
      expect(confirmation).toContain("Schema:");
      expect(confirmation).toContain("Default config:");
      await press(setup, "n");
      await waitForFrame(setup, (frame) =>
        frame.includes("Apply canceled; no changes made."),
      );
      expect(await readFile(configPath, "utf8")).toBe(originalConfig);
      expect(
        await exists(path.join(root, "openspec", "schemas", targetSchema)),
      ).toBe(false);

      await press(setup, "escape");
      await focusRow(setup, "Schema fixture-schema", "up");
      await press(setup, "space");
      await focusRow(setup, `MCP provider ${fixtureProvider}`);
      await press(setup, "space");
      await focusRow(setup, "MCP host atomic", "down");
      await press(setup, "space");
      await press(setup, "m");
      const mcpPreview = await waitForFrame(setup, (frame) =>
        frame.includes("MCP provider preview — read only:"),
      );
      expect(mcpPreview).toContain(`Provider: ${fixtureProvider}`);
      expect(mcpPreview).toContain(`URL: ${fixtureUrl}`);
      expect(mcpPreview).toContain("Host: atomic");
      expect(mcpPreview).toContain(`Target project: ${root}`);
      expect(mcpPreview).toContain("Authentication: none");
      expect(mcpPreview).toContain("Permissions: read-only");
      expect(mcpPreview).toContain("Proposed config diff:");
      const expectedInstall = await previewMcpInstall({
        schemaDir,
        providerName: fixtureProvider,
        host: "atomic",
        targetDir: root,
      });
      expect(expectedInstall.configPath).not.toBeNull();

      await withTTY(true, async () => {
        await press(setup, "i");
        const approval = await waitForFrame(setup, (frame) =>
          frame.includes("PROVIDER APPROVAL"),
        );
        expect(approval).toContain(`URL: ${fixtureUrl}`);
        expect(approval).toContain("Host: atomic");
        expect(approval).toContain("Authentication: none");
        expect(approval).toContain("Permissions: read-only");
        expect(approval).toContain("Proposed config diff:");
        await press(setup, "n");
        await waitForFrame(setup, (frame) =>
          frame.includes("MCP install denied; no changes made."),
        );
      });
      expect(await exists(expectedInstall.configPath!)).toBe(false);

      await press(setup, "m");
      await waitForFrame(setup, (frame) =>
        frame.includes("MCP provider preview — read only:"),
      );
      await withTTY(true, async () => {
        await press(setup, "i");
        await waitForFrame(setup, (frame) =>
          frame.includes("PROVIDER APPROVAL"),
        );
        await press(setup, "escape");
        await waitForFrame(setup, (frame) =>
          frame.includes("MCP install canceled; no changes made."),
        );
      });
      expect(await exists(expectedInstall.configPath!)).toBe(false);

      await press(setup, "m");
      await waitForFrame(setup, (frame) =>
        frame.includes("MCP provider preview — read only:"),
      );
      await writeFile(
        path.join(schemaDir, "mcp.yaml"),
        fixtureCatalog("https://changed.fixture.invalid/mcp"),
      );
      let stale = "";
      await withTTY(true, async () => {
        await press(setup, "i");
        stale = await waitForFrame(setup, (frame) =>
          frame.includes("Provider target changed after preview"),
        );
      });
      expect(stale).toContain("Provider target changed after preview");
      expect(await exists(expectedInstall.configPath!)).toBe(false);
      expect(await readFile(configPath, "utf8")).toBe(originalConfig);
    } finally {
      act(() => setup.renderer.destroy());
    }
  },
  { timeout: 30_000 },
);
