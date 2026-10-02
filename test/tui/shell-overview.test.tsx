import { expect, test } from "bun:test";
import { act, useState } from "react";
import { engine } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import type { ChangeSummary } from "../../src/domain/snapshot.ts";
import { Overview } from "../../src/tui/overview.tsx";
import { PendingRead, tuiTextColor } from "../../src/tui/theme.tsx";

test("independent Overview reads retain available data and expose partial states", async () => {
  const setup = await testRender(
    <Overview
      specifications={{
        status: "loaded",
        value: { specifications: 2, requirements: 3 },
      }}
      activeChanges={{ status: "error", message: "inventory unavailable" }}
      completedChanges={{ status: "pending" }}
      reducedMotion
      noColor
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    const first = setup.captureCharFrame();
    expect(first).toContain("Specifications: 2");
    expect(first).toContain("Requirements: 3");
    expect(first).toContain("inventory unavailable");
    await act(async () => {
      setup.mockInput.pressKey("END");
      await Bun.sleep(30);
      await setup.renderOnce();
    });
    expect(setup.captureCharFrame()).toContain("Loading completed changes");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Overview scroll reaches retained history after a long active list", async () => {
  const activeChanges: ChangeSummary[] = Array.from(
    { length: 10 },
    (_, index) => ({
      name: "active-change-" + String(index + 1).padStart(2, "0"),
      status: "in-progress",
      schema: "schema-v1",
      artifacts: [],
      tasks: null,
    }),
  );
  const setup = await testRender(
    <Overview
      specifications={{
        status: "loaded",
        value: { specifications: 2, requirements: 3 },
      }}
      activeChanges={{ status: "loaded", value: activeChanges }}
      completedChanges={{
        status: "loaded",
        value: [{ name: "archived-tail" }],
      }}
      reducedMotion
      noColor
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("active-change-01");
    expect(setup.captureCharFrame()).not.toContain("archived-tail");
    await act(async () => {
      setup.mockInput.pressKey("END");
      await Bun.sleep(30);
      await setup.renderOnce();
    });
    expect(setup.captureCharFrame()).toContain("archived-tail");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("register separates active work from numbered historical records without color", async () => {
  const setup = await testRender(
    <Overview
      specifications={{
        status: "loaded",
        value: { specifications: 1, requirements: 2 },
      }}
      activeChanges={{
        status: "loaded",
        value: [
          {
            name: "current-work",
            status: "in-progress",
            schema: "schema-v1",
            artifacts: [],
            tasks: { total: 4, complete: 2, remaining: 2 },
          },
        ],
      }}
      completedChanges={{ status: "loaded", value: [{ name: "old-work" }] }}
      reducedMotion
      noColor
    />,
    { width: 60, height: 18 },
  );
  try {
    await setup.renderOnce();
    const activeFrame = setup.captureCharFrame();
    expect(activeFrame).toContain("ACTIVE / WORK IN PROGRESS");
    expect(activeFrame).toContain("01 Change: current-work");
    expect(activeFrame).toContain("Planning: Unknown");
    expect(activeFrame).toContain("Tasks: 2/4");
    await act(async () => {
      setup.mockInput.pressKey("END");
      await Bun.sleep(30);
      await setup.renderOnce();
    });
    const historyFrame = setup.captureCharFrame();
    expect(historyFrame).toContain("HISTORY / ARCHIVED RECORDS");
    expect(historyFrame).toContain("01 Historical · old-work");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("unknown totals have no fabricated progress bar", async () => {
  const active: ChangeSummary = {
    name: "unmeasured",
    status: "in-progress",
    schema: "schema-v1",
    artifacts: [],
    tasks: null,
  };
  const setup = await testRender(
    <Overview
      specifications={{
        status: "loaded",
        value: { specifications: 0, requirements: 0 },
      }}
      activeChanges={{ status: "loaded", value: [active] }}
      completedChanges={{ status: "loaded", value: [] }}
      reducedMotion
      noColor
    />,
    { width: 100, height: 32 },
  );
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame).toContain("Unknown");
    expect(frame).not.toMatch(/\[[=-]{6,16}\]/);
  } finally {
    act(() => setup.renderer.destroy());
  }
});

for (const [checked, total] of [
  [0, 10],
  [1, 10],
  [9, 10],
  [10, 10],
  [99, 100],
  [0, 0],
]) {
  test(`Overview leads with exact tasks ${checked}/${total}, remaining and independent planning`, async () => {
    const setup = await testRender(
      <Overview
        specifications={{
          status: "loaded",
          value: { specifications: 1, requirements: 2 },
        }}
        activeChanges={{
          status: "loaded",
          value: [
            {
              name: "truthful-progress",
              status: "in-progress",
              schema: "schema-v1",
              artifacts: [{ id: "proposal", status: "done" }],
              tasks: {
                complete: checked!,
                total: total!,
                remaining: total! - checked!,
              },
            },
          ],
        }}
        completedChanges={{ status: "loaded", value: [] }}
        noColor
        reducedMotion
      />,
      { width: 60, height: 32 },
    );
    try {
      await setup.renderOnce();
      const frame = setup.captureCharFrame();
      expect(frame).toContain(`Tasks: ${checked}/${total}`);
      expect(frame.indexOf("Tasks:")).toBeLessThan(frame.indexOf("Planning:"));
      expect(frame).toContain("Planning: 1/1 changes");
      expect(frame).toContain("1/1 artifacts ready");
      if (total === 0) {
        expect(frame).toContain("No checklist tasks");
        expect(frame).not.toMatch(/\[[=-]+\]/);
      } else {
        expect(frame).toContain(`${total! - checked!} remaining`);
        const cells = 6;
        const filled =
          checked === total
            ? cells
            : Math.min(cells - 1, Math.floor((checked! / total!) * cells));
        const track = `[${"=".repeat(filled)}${"-".repeat(cells - filled)}]`;
        expect(frame.match(/\[[=-]+\]/g)).toEqual([track, track]);
      }
      expect(frame).not.toContain("100%");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
}

for (const activeChanges of [
  { status: "pending" } as const,
  { status: "error", message: "inventory unavailable" } as const,
]) {
  test(`Overview ${activeChanges.status} task context is not successful zero or Unknown`, async () => {
    const setup = await testRender(
      <Overview
        specifications={{
          status: "loaded",
          value: { specifications: 1, requirements: 2 },
        }}
        activeChanges={activeChanges}
        completedChanges={{ status: "loaded", value: [] }}
        noColor
        reducedMotion
      />,
      { width: 100, height: 32 },
    );
    try {
      await setup.renderOnce();
      const frame = setup.captureCharFrame();
      expect(frame).toContain(
        activeChanges.status === "pending"
          ? "Task progress: Loading"
          : "Task progress unavailable",
      );
      expect(frame).not.toContain("Task progress: Unknown");
      expect(frame).not.toContain("No checklist tasks");
      expect(frame).not.toMatch(/\[[=-]+\]/);
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
}

test("invalid task counts remain Unknown even with complete planning", async () => {
  const setup = await testRender(
    <Overview
      specifications={{
        status: "loaded",
        value: { specifications: 1, requirements: 1 },
      }}
      activeChanges={{
        status: "loaded",
        value: [
          {
            name: "invalid-counts",
            schema: "schema-v1",
            status: "in-progress",
            artifacts: [{ id: "proposal", status: "done" }],
            tasks: { complete: 11, total: 10, remaining: -1 },
          },
        ],
      }}
      completedChanges={{ status: "loaded", value: [] }}
      noColor
      reducedMotion
    />,
    { width: 100, height: 32 },
  );
  try {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    expect(frame.match(/Task progress: Unknown/g)).toHaveLength(2);
    expect(frame).toContain("1/1 artifacts ready");
    expect(frame).not.toMatch(/\[[=-]+\]/);
    expect(frame).not.toContain("11/10");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("Overview complete-to-99/100 updates both tracks truthfully in every frame", async () => {
  let updateChecked!: (checked: number) => void;
  function Harness() {
    const [checked, setChecked] = useState(100);
    updateChecked = setChecked;
    return (
      <Overview
        specifications={{
          status: "loaded",
          value: { specifications: 1, requirements: 1 },
        }}
        activeChanges={{
          status: "loaded",
          value: [
            {
              name: "regression",
              schema: "schema-v1",
              status: "in-progress",
              artifacts: [],
              tasks: {
                complete: checked,
                total: 100,
                remaining: 100 - checked,
              },
            },
          ],
        }}
        completedChanges={{ status: "loaded", value: [] }}
        noColor={false}
        reducedMotion={false}
      />
    );
  }
  const setup = await testRender(<Harness />, { width: 100, height: 32 });
  engine.attach(setup.renderer);
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame().match(/\[={16}\]/g)).toHaveLength(2);
    await act(async () => {
      updateChecked(99);
    });
    await act(async () => {
      await setup.renderOnce();
    });
    for (const elapsed of [0, 1, 65, 130, 260, 400]) {
      await act(async () => {
        engine.update(elapsed);
      });
      await act(async () => {
        await setup.renderOnce();
      });
      const frame = setup.captureCharFrame();
      expect(frame.match(/99\/100/g)).toHaveLength(2);
      expect(frame.match(/1 remaining/g)).toHaveLength(2);
      expect(frame.match(/\[={15}-\]/g)).toHaveLength(2);
      expect(frame).not.toContain("100%");
    }
  } finally {
    act(() => setup.renderer.destroy());
    engine.detach();
  }
});

let refreshAnimatedTasks!: (schema: string, checked: number) => void;

function AnimatedOverviewHarness() {
  const [schema, setSchema] = useState("schema-v1");
  const [checked, setChecked] = useState(1);
  refreshAnimatedTasks = (nextSchema, nextChecked) => {
    setSchema(nextSchema);
    setChecked(nextChecked);
  };
  const active: ChangeSummary = {
    name: "animated-change",
    status: "in-progress",
    schema,
    artifacts: [],
    tasks: { total: 4, complete: checked, remaining: 4 - checked },
  };
  return (
    <Overview
      specifications={{
        status: "loaded",
        value: { specifications: 1, requirements: 1 },
      }}
      activeChanges={{ status: "loaded", value: [active] }}
      completedChanges={{ status: "loaded", value: [] }}
      reducedMotion={false}
      noColor={false}
    />
  );
}

function implementationProgressBar(frame: string): string | undefined {
  return frame.match(/\[[=-]{16}\]/)?.[0];
}

test("Overview animates only when task progress changes", async () => {
  const setup = await testRender(<AnimatedOverviewHarness />, {
    width: 100,
    height: 30,
  });
  engine.attach(setup.renderer);
  try {
    await act(async () => {
      await setup.renderOnce();
    });
    const initialFrame = setup.captureCharFrame();
    const initialBar = implementationProgressBar(initialFrame);
    expect(initialFrame).toContain("1/4");
    expect(initialBar).toBe("[====------------]");

    await act(async () => {
      refreshAnimatedTasks("schema-v2", 1);
      await setup.renderOnce();
    });
    const unrelatedRefreshFrame = setup.captureCharFrame();
    expect(implementationProgressBar(unrelatedRefreshFrame)).toBe(initialBar);

    await act(async () => {
      engine.update(300);
      await setup.renderOnce();
    });
    expect(implementationProgressBar(setup.captureCharFrame())).toBe(
      initialBar,
    );

    await act(async () => {
      refreshAnimatedTasks("schema-v2", 3);
      await setup.renderOnce();
    });
    const changedFrame = setup.captureCharFrame();
    const changedBar = implementationProgressBar(changedFrame);
    expect(changedFrame).toContain("3/4");
    expect(changedBar).toBe(initialBar);

    await act(async () => {
      engine.update(130);
    });
    await act(async () => {
      await setup.renderOnce();
    });
    expect(implementationProgressBar(setup.captureCharFrame())).not.toBe(
      changedBar,
    );

    await act(async () => {
      engine.update(260);
    });
    await act(async () => {
      await setup.renderOnce();
    });
    expect(implementationProgressBar(setup.captureCharFrame())).toBe(
      "[============----]",
    );
  } finally {
    act(() => setup.renderer.destroy());
    engine.detach();
  }
});

test("PendingRead animates only while unresolved and reduced motion stays static", async () => {
  let settlePending: () => void = () => {};
  function PendingHarness() {
    const [pending, setPending] = useState(true);
    settlePending = () => setPending(false);
    return pending ? (
      <PendingRead label="Loading active changes" reducedMotion />
    ) : (
      <text>Active changes loaded</text>
    );
  }

  const setup = await testRender(<PendingHarness />, { width: 60, height: 18 });
  try {
    await setup.renderOnce();
    const initialFrame = setup.captureCharFrame();
    expect(initialFrame).toContain("[loading] Loading active changes");

    await act(async () => {
      settlePending();
    });
    await setup.renderOnce();
    const settledFrame = setup.captureCharFrame();
    expect(settledFrame).toContain("Active changes loaded");
    expect(settledFrame).not.toContain("Loading active changes");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

test("NO_COLOR keeps pending indicators static and disables shared text color", async () => {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "";
  const setup = await testRender(<PendingRead label="Waiting for sections" />, {
    width: 60,
    height: 18,
  });
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain(
      "[loading] Waiting for sections",
    );
    expect(tuiTextColor("accent")).toBeUndefined();
  } finally {
    act(() => setup.renderer.destroy());
    if (previous === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previous;
    }
  }
});
