import { expect, test } from "bun:test";
import { act, useState } from "react";
import { engine } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import type { TaskProgress } from "../../src/tui/model.ts";
import { TaskProgressView } from "../../src/tui/progress.tsx";

const TRACK = /\[[=-]+\]/;
function tasks(checked: number, total: number): TaskProgress {
  return { checked, total, remaining: total - checked };
}

for (const cells of [1, 2, 4, 6, 16]) {
  for (const [checked, total] of [
    [0, 10],
    [1, 10],
    [9, 10],
    [10, 10],
    [99, 100],
  ]) {
    test(`task counts and remaining lead a truthful ${cells}-cell track at ${checked}/${total}`, async () => {
      const setup = await testRender(
        <TaskProgressView
          progress={tasks(checked!, total!)}
          cells={cells}
          compact
          reducedMotion
          noColor
        />,
        { width: 60, height: 18 },
      );
      try {
        await setup.renderOnce();
        const frame = setup.captureCharFrame();
        const filled =
          checked === total
            ? cells
            : Math.min(cells - 1, Math.floor((checked! / total!) * cells));
        expect(frame).toContain(
          `Tasks: ${checked}/${total} · ${total! - checked!} remaining`,
        );
        expect(frame.match(TRACK)?.[0]).toBe(
          `[${"=".repeat(filled)}${"-".repeat(cells - filled)}]`,
        );
        expect(frame).not.toContain("100%");
      } finally {
        act(() => setup.renderer.destroy());
      }
    });
  }
}

for (const progress of [null, tasks(0, 0)]) {
  test(`${progress ? "zero tasks" : "Unknown"} has no track or percentage`, async () => {
    const setup = await testRender(
      <TaskProgressView progress={progress} noColor />,
      { width: 100, height: 18 },
    );
    try {
      await setup.renderOnce();
      const frame = setup.captureCharFrame();
      expect(frame).toContain(
        progress ? "0/0 · No checklist tasks" : "Unknown",
      );
      expect(frame).not.toMatch(TRACK);
      expect(frame).not.toContain("%");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
}

test("historical progress is explicit and static", async () => {
  const setup = await testRender(
    <TaskProgressView
      progress={tasks(9, 10)}
      historical
      noColor={false}
      reducedMotion={false}
    />,
    { width: 100, height: 18 },
  );
  try {
    await setup.renderOnce();
    expect(setup.captureCharFrame()).toContain("Historical tasks: 9/10");
    expect(setup.captureCharFrame()).toContain("1 remaining");
  } finally {
    act(() => setup.renderer.destroy());
  }
});

type HarnessProps = {
  initial: TaskProgress | null;
  noColor?: boolean;
  reducedMotion?: boolean;
  historical?: boolean;
};
async function progressHarness({
  initial,
  noColor = false,
  reducedMotion = false,
  historical = false,
}: HarnessProps) {
  let updateProgress!: (
    progress: TaskProgress | null,
    identity?: string,
  ) => void;
  function Harness() {
    const [progress, setProgress] = useState(initial);
    const [identity, setIdentity] = useState("same-item");
    updateProgress = (next, nextIdentity = "same-item") => {
      setProgress(next);
      setIdentity(nextIdentity);
    };
    return (
      <TaskProgressView
        progress={progress}
        cells={4}
        transitionKey={identity}
        historical={historical}
        noColor={noColor}
        reducedMotion={reducedMotion}
      />
    );
  }
  const setup = await testRender(<Harness />, { width: 100, height: 18 });
  engine.attach(setup.renderer);
  await act(async () => {
    await setup.renderOnce();
  });
  async function frameAfter(milliseconds: number) {
    await act(async () => {
      engine.update(milliseconds);
    });
    await act(async () => {
      await setup.renderOnce();
    });
    return setup.captureCharFrame();
  }
  return { setup, updateProgress, frameAfter };
}

for (const staticMode of [
  { noColor: true },
  { reducedMotion: true },
  { historical: true },
]) {
  test(`known updates are static with ${Object.keys(staticMode)[0]}`, async () => {
    const { setup, updateProgress, frameAfter } = await progressHarness({
      initial: tasks(1, 10),
      ...staticMode,
    });
    try {
      await act(async () => {
        updateProgress(tasks(9, 10));
      });
      await act(async () => {
        await setup.renderOnce();
      });
      for (const elapsed of [0, 65, 130, 260]) {
        expect((await frameAfter(elapsed)).match(TRACK)?.[0]).toBe("[===-]");
      }
    } finally {
      act(() => setup.renderer.destroy());
      engine.detach();
    }
  });
}

test("unchanged known data and unknown-to-known never invent animation", async () => {
  const { setup, updateProgress, frameAfter } = await progressHarness({
    initial: null,
  });
  try {
    expect(setup.captureCharFrame()).not.toMatch(TRACK);
    await act(async () => {
      updateProgress(tasks(9, 10));
    });
    await act(async () => {
      await setup.renderOnce();
    });
    for (const elapsed of [0, 65, 130, 260]) {
      expect((await frameAfter(elapsed)).match(TRACK)?.[0]).toBe("[===-]");
    }
    await act(async () => {
      updateProgress(tasks(9, 10));
    });
    await act(async () => {
      await setup.renderOnce();
    });
    for (const elapsed of [0, 130, 260]) {
      expect((await frameAfter(elapsed)).match(TRACK)?.[0]).toBe("[===-]");
    }
    await act(async () => {
      updateProgress(tasks(1, 10), "another-item");
    });
    await act(async () => {
      await setup.renderOnce();
    });
    expect(setup.captureCharFrame().match(TRACK)?.[0]).toBe("[----]");
  } finally {
    act(() => setup.renderer.destroy());
    engine.detach();
  }
});

test("genuine known transition has first, intermediate and final frames", async () => {
  const { setup, updateProgress, frameAfter } = await progressHarness({
    initial: tasks(0, 10),
  });
  try {
    await act(async () => {
      updateProgress(tasks(9, 10));
    });
    await act(async () => {
      await setup.renderOnce();
    });
    const first = setup.captureCharFrame();
    expect(first).toContain("9/10");
    expect(first.match(TRACK)?.[0]).toBe("[----]");
    const middle = await frameAfter(130);
    expect(middle.match(TRACK)?.[0]).not.toBe("[----]");
    expect(middle.match(TRACK)?.[0]).not.toBe("[====]");
    expect((await frameAfter(260)).match(TRACK)?.[0]).toBe("[===-]");
  } finally {
    act(() => setup.renderer.destroy());
    engine.detach();
  }
});

test("NO_COLOR and REDUCED_MOTION environment defaults are static", async () => {
  const previousColor = process.env.NO_COLOR;
  const previousMotion = process.env.REDUCED_MOTION;
  process.env.NO_COLOR = "";
  process.env.REDUCED_MOTION = "1";
  let updateProgress!: (progress: TaskProgress) => void;
  function Harness() {
    const [progress, setProgress] = useState(tasks(1, 10));
    updateProgress = setProgress;
    return <TaskProgressView progress={progress} cells={4} />;
  }
  const setup = await testRender(<Harness />, { width: 100, height: 18 });
  engine.attach(setup.renderer);
  try {
    await setup.renderOnce();
    await act(async () => {
      updateProgress(tasks(9, 10));
    });
    await act(async () => {
      await setup.renderOnce();
    });
    const first = setup.captureCharFrame();
    expect(first.match(TRACK)?.[0]).toBe("[===-]");
    await act(async () => {
      engine.update(130);
    });
    await act(async () => {
      await setup.renderOnce();
    });
    expect(setup.captureCharFrame()).toBe(first);
  } finally {
    act(() => setup.renderer.destroy());
    engine.detach();
    if (previousColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previousColor;
    }
    if (previousMotion === undefined) {
      delete process.env.REDUCED_MOTION;
    } else {
      process.env.REDUCED_MOTION = previousMotion;
    }
  }
});

test("complete-to-incomplete regression never has a full current track in any frame", async () => {
  const { setup, updateProgress, frameAfter } = await progressHarness({
    initial: tasks(100, 100),
  });
  try {
    expect(setup.captureCharFrame().match(TRACK)?.[0]).toBe("[====]");
    await act(async () => {
      updateProgress(tasks(99, 100));
    });
    await act(async () => {
      await setup.renderOnce();
    });
    const first = setup.captureCharFrame();
    expect(first).toContain("99/100");
    expect(first).toContain("1 remaining");
    expect(first.match(TRACK)?.[0]).toBe("[===-]");
    for (const elapsed of [0, 1, 65, 130, 195, 260, 400]) {
      const frame = await frameAfter(elapsed);
      expect(frame).toContain("99/100");
      expect(frame.match(TRACK)?.[0]).toBe("[===-]");
      expect(frame).not.toContain("100%");
    }
  } finally {
    act(() => setup.renderer.destroy());
    engine.detach();
  }
});
