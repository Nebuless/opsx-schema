# Testing

**Canonical:** https://opentui.com/docs/core-concepts/testing/

## When to use

Use this reference when React reconciliation, effects, input, mouse behavior, rendered text, or native cell output needs deterministic coverage without writing to a user's terminal.

## Imports and setup

For React behavior, use `testRender` from the public React test subpath. Its options object is required and it returns the Core in-memory test setup:

```tsx
import { testRender } from "@opentui/react/test-utils"

const setup = await testRender(<text>Ready</text>, { width: 30, height: 5 })
try {
  await setup.waitForFrame((frame) => frame.includes("Ready"))
  console.log(setup.captureCharFrame())
} finally {
  setup.renderer.destroy()
}
```

For Core-only behavior, import `createTestRenderer` from `@opentui/core/testing`. Use `setup.mockInput` and `setup.mockMouse` to exercise the real terminal parsers, then `renderOnce`, `waitForFrame`, `captureCharFrame`, or `captureSpans` to assert observable output.

## React/Core boundary

`testRender` is React binding API over Core's native in-memory `createTestRenderer`; Core owns layout, input parsing, native frames, and cleanup. It does not use `createCliRenderer()` or host raw mode by default. Do not assert React implementation details or DOM behavior.

## Lifecycle and testing pitfalls

- Always destroy `setup.renderer` in `finally` or test teardown. Renderer destruction unmounts the React root; `root.unmount()` does not destroy the renderer.
- `renderOnce()` forces one pass. `waitForFrame()` waits for scheduled app work. `waitForVisualIdle()` waits for no scheduled work or bounded quiet frames, not wall-clock time.
- Test coordinates are zero-based. `typeText()` splits UTF-16 code units; use bracketed paste or whole UTF-8 input for multi-code-unit graphemes.
- Use `setRendererCapabilities` with `createTerminalCapabilities` when protocol-dependent behavior matters. Default capability booleans are disabled.
- Use `ManualClock` for timers; advance it explicitly. Avoid unbounded `runAll()` when intervals remain active.
- Use `createCliRenderer()` with custom streams only when testing the real output transport; it can affect terminal state.

## Canonical sources

- [Testing](https://opentui.com/docs/core-concepts/testing/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [Rendering diagnostics](https://opentui.com/docs/test-and-debug/rendering-diagnostics/)
- [Package entry points](https://opentui.com/docs/reference/package-entrypoints/)
