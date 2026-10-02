import { expect, test } from "bun:test";
import { OptimizedBuffer, parseColor, RGBA } from "@opentui/core";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { SectionPanel } from "../../src/tui/presentation.tsx";
import { paintPanel } from "../../src/tui/panel-paint.ts";
import { TUI_COLORS, TUI_SURFACES } from "../../src/tui/theme.tsx";

const white = parseColor("#FFFFFF");
const transparent = RGBA.fromValues(0, 0, 0, 0);
const bounds = { x: 1, y: 2, width: 17, height: 6 };
function cells(buffer: OptimizedBuffer) {
  return {
    chars: Array.from(buffer.buffers.char),
    fg: Array.from(buffer.buffers.fg),
    bg: Array.from(buffer.buffers.bg),
  };
}

for (const background of [
  undefined,
  parseColor(TUI_SURFACES.active),
  parseColor(TUI_SURFACES.history),
]) {
  test(
    "native panel paint preserves single-border identity and visible colors: " +
      String(background),
    () => {
      const legacy = OptimizedBuffer.create(20, 10, "unicode");
      const clipped = OptimizedBuffer.create(20, 10, "unicode");
      try {
        legacy.clear();
        clipped.clear();
        legacy.drawBox({
          ...bounds,
          border: true,
          borderStyle: "single",
          borderColor: white,
          backgroundColor: background ?? transparent,
          shouldFill: true,
        });
        paintPanel(clipped, bounds, white, background);
        expect(
          new TextDecoder().decode(clipped.getRealCharBytes(true)),
        ).toEqual(new TextDecoder().decode(legacy.getRealCharBytes(true)));
        // Foreground of blanks is not visible, but backgrounds and border ink are.
        expect(cells(clipped).bg).toEqual(cells(legacy).bg);
        for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
          for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
            if (
              y === bounds.y ||
              y === bounds.y + bounds.height - 1 ||
              x === bounds.x ||
              x === bounds.x + bounds.width - 1
            ) {
              const index = (y * 20 + x) * 4;
              expect(cells(clipped).fg.slice(index, index + 4)).toEqual(
                cells(legacy).fg.slice(index, index + 4),
              );
            }
          }
        }
      } finally {
        legacy.destroy();
        clipped.destroy();
      }
    },
  );

  test(
    "native clipping protects border AND background cells outside a nested viewport: " +
      String(background),
    () => {
      const buffer = OptimizedBuffer.create(20, 10, "unicode");
      try {
        buffer.clear(parseColor(TUI_SURFACES.header));
        buffer.drawText("HEADER", 1, 0, white, parseColor(TUI_SURFACES.header));
        buffer.drawText("FOOTER", 1, 9, white, parseColor(TUI_SURFACES.header));
        const before = cells(buffer);
        buffer.pushScissorRect(0, 2, 20, 7);
        buffer.pushScissorRect(1, 3, 17, 5);
        paintPanel(
          buffer,
          { x: 0, y: -2, width: 20, height: 14 },
          parseColor(TUI_COLORS.accent),
          background,
        );
        buffer.popScissorRect();
        buffer.popScissorRect();
        const after = cells(buffer);
        for (let y = 0; y < 10; y++) {
          for (let x = 0; x < 20; x++) {
            if (x < 1 || x >= 18 || y < 3 || y >= 8) {
              const index = y * 20 + x;
              expect(after.chars[index]).toBe(before.chars[index]);
              expect(after.bg.slice(index * 4, index * 4 + 4)).toEqual(
                before.bg.slice(index * 4, index * 4 + 4),
              );
              expect(after.fg.slice(index * 4, index * 4 + 4)).toEqual(
                before.fg.slice(index * 4, index * 4 + 4),
              );
            }
          }
        }
      } finally {
        buffer.destroy();
      }
    },
  );
}

test("opt-in SectionPanel retains children placement, wrapping, tone and default callers", async () => {
  const old = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  const render = async (clipSafe: boolean) => {
    const setup = await testRender(
      <SectionPanel
        title="ACTIVE"
        state="Ready"
        tone="accent"
        clipSafe={clipSafe}
      >
        <text wrapMode="char">
          A long line that wraps inside the same panel geometry
        </text>
        <text>CHILD</text>
      </SectionPanel>,
      { width: 32, height: 10 },
    );
    try {
      await setup.renderOnce();
      return {
        text: setup.captureCharFrame(),
        spans: setup.captureSpans().lines,
      };
    } finally {
      act(() => setup.renderer.destroy());
    }
  };
  try {
    const baseline = await render(false);
    const optedIn = await render(true);
    expect(optedIn.text).toEqual(baseline.text);
    expect(optedIn.text).toContain("CHILD");
    expect(optedIn.spans).toEqual(baseline.spans);
  } finally {
    if (old === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = old;
    }
  }
});
