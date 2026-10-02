import { expect, test } from "bun:test";
import {
  type BaseRenderable,
  CodeRenderable,
  getLinkId,
  type ScrollBoxRenderable,
  TextAttributes,
} from "@opentui/core";
import { setRendererCapabilities } from "@opentui/core/testing";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { NativeDocument } from "../../src/tui/document.tsx";
import { boundedPreview } from "../../src/tui/model.ts";

const SIZES = [
  [100, 32],
  [60, 18],
] as const;
type Setup = Awaited<ReturnType<typeof testRender>>;

async function settle(setup: Setup) {
  await act(async () => {
    await setup.renderOnce();
    await Bun.sleep(250);
    await setup.renderOnce();
  });
}

function codeNodes(node: BaseRenderable): CodeRenderable[] {
  return [
    ...(node instanceof CodeRenderable ? [node] : []),
    ...node.getChildren().flatMap(codeNodes),
  ];
}

function linksInFrame(setup: Setup): number[] {
  return [...setup.renderer.currentRenderBuffer.buffers.attributes]
    .map(getLinkId)
    .filter((id) => id !== 0);
}

test("native positive control exposes terminal hyperlinks; passive document does not", async () => {
  const control = await testRender(
    <text>
      <a href="https://example.invalid/control">clickable control</a>
    </text>,
    { width: 100, height: 32 },
  );
  try {
    setRendererCapabilities(control.renderer, { hyperlinks: true });
    await settle(control);
    expect(linksInFrame(control).length).toBeGreaterThan(0);
  } finally {
    act(() => control.renderer.destroy());
  }
  for (const [width, height] of SIZES) {
    const setup = await testRender(
      <NativeDocument
        content={
          "# Reader\n\n[guide](https://example.invalid/doc)\n\n| Link | Destination |\n| --- | --- |\n| [row](https://example.invalid/table) | kept |"
        }
      />,
      { width, height },
    );
    try {
      setRendererCapabilities(setup.renderer, { hyperlinks: true });
      await settle(setup);
      const frame = setup.captureCharFrame();
      expect(frame).toContain("https://example.invalid/doc");
      expect(frame).toContain("https://example.invalid/table");
      expect(linksInFrame(setup)).toEqual([]);
      await act(async () => {
        await setup.mockMouse.click(3, 2);
        setup.mockInput.pressEnter();
        setup.mockInput.pressKey(" ");
        await setup.renderOnce();
      });
      expect(setup.captureCharFrame()).toBe(frame);
      expect(linksInFrame(setup)).toEqual([]);
    } finally {
      act(() => setup.renderer.destroy());
    }
  }
});

for (const [width, height] of SIZES) {
  test(`native document structure at ${width}x${height}`, async () => {
    const content =
      "# Primary\n## Secondary\n### Third\n#### Fourth\n##### Fifth\n###### Sixth\n\n**strong** and *italic* and `inline()`\n\n1. ordered first\n2. ordered second\n\n- unordered\n- [x] checked task\n- [ ] unchecked task";
    let scroll: ScrollBoxRenderable | null = null;
    const setup = await testRender(
      <scrollbox
        ref={(node) => {
          scroll = node;
        }}
        height={height}
        width={width}
      >
        <NativeDocument content={content} />
      </scrollbox>,
      { width, height },
    );
    try {
      await settle(setup);
      const firstFrame = setup.captureCharFrame();
      let frame = firstFrame;
      for (let row = 0; row < 10; row++) {
        await act(async () => {
          scroll?.scrollBy({ x: 0, y: 1 });
          await setup.renderOnce();
        });
        frame += setup.captureCharFrame();
      }
      for (const phrase of [
        "Primary",
        "Secondary",
        "Third",
        "Fourth",
        "Fifth",
        "Sixth",
        "strong",
        "italic",
        "inline()",
        "ordered first",
        "ordered second",
        "unordered",
        "checked task",
        "unchecked task",
      ]) {
        expect(frame).toContain(phrase);
      }
      await act(async () => {
        scroll?.scrollTo({ x: 0, y: 0 });
        await setup.renderOnce();
      });
      const spans = setup.captureSpans().lines.flatMap((line) => line.spans);
      expect(
        spans.some(
          (span) =>
            span.text.includes("Primary") &&
            (span.attributes & TextAttributes.BOLD) !== 0,
        ),
      ).toBe(true);
      expect(
        spans.some(
          (span) =>
            span.text.includes("strong") &&
            (span.attributes & TextAttributes.BOLD) !== 0,
        ),
      ).toBe(true);
      expect(
        spans.some(
          (span) =>
            span.text.includes("italic") &&
            (span.attributes & TextAttributes.ITALIC) !== 0,
        ),
      ).toBe(true);
      expect(frame).toMatch(/\[x\]|☑|✓/);
      expect(frame).toMatch(/\[ \]|☐/);
      setup.mockInput.pressKey(" ");
      setup.mockInput.pressEnter();
      await settle(setup);
      expect(setup.captureCharFrame()).toBe(firstFrame);
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  test(`plain fenced code and trailing structures at ${width}x${height}`, async () => {
    for (const content of [
      "",
      "```typescript\nconst typed = 1;\n```",
      "```https://example.invalid/grammar.wasm\n$(touch /tmp/do-not-execute)\n",
      "| Name | Count |\n| --- | --- |\n| preserved | 99 |\n| trailing",
      "1. first\n2. trailing",
      "- [x] completed\n- [ ] trailing",
    ]) {
      const setup = await testRender(
        <NativeDocument content={content} noColor />,
        { width, height },
      );
      try {
        await settle(setup);
        if (content.includes("const typed")) {
          expect(setup.captureCharFrame()).toContain("const typed = 1;");
          expect(
            codeNodes(setup.renderer.root)
              .filter((node) => node.content.includes("const typed"))
              .every((node) => node.filetype === undefined),
          ).toBe(true);
        }
        if (content.includes("touch")) {
          expect(setup.captureCharFrame()).toContain(
            "$(touch /tmp/do-not-execute)",
          );
          expect(
            codeNodes(setup.renderer.root)
              .filter((node) => node.content.includes("touch"))
              .every((node) => node.filetype === undefined),
          ).toBe(true);
        }
        if (content.includes("trailing")) {
          expect(setup.captureCharFrame()).toContain("trailing");
        }
        expect(linksInFrame(setup)).toEqual([]);
      } finally {
        act(() => setup.renderer.destroy());
      }
    }
  });

  test(`wide table remains scroll-reachable and sanitized prefix stays literal at ${width}x${height}`, async () => {
    const preview = boundedPreview(
      "| Identity | Values |\n| --- | --- |\n| " +
        "wide-identity-".repeat(15) +
        " | final-cell |\n\n```sh\n\x1b]52;c;payload\x07\n\x1b[2J\n\x00 literal-end",
    );
    let scroll: ScrollBoxRenderable | null = null;
    const setup = await testRender(
      <scrollbox
        ref={(node) => {
          scroll = node;
        }}
        height={height}
        width={width}
      >
        <NativeDocument content={preview.text} />
      </scrollbox>,
      { width, height },
    );
    try {
      await settle(setup);
      let frames = setup.captureCharFrame();
      for (let row = 0; row < 24; row++) {
        await act(async () => {
          scroll?.scrollBy({ x: 0, y: 1 });
          await setup.renderOnce();
        });
        frames += setup.captureCharFrame();
      }
      expect(frames).toContain("final-cell");
      expect(frames).toContain("literal-end");
      expect(frames).toContain("␛[2J");
      expect(frames).toContain("]52;c;payload");
      expect(frames).not.toContain("\x1b");
      expect(linksInFrame(setup)).toEqual([]);
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
}
