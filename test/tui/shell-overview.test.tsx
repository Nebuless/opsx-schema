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
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});
