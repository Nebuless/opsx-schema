# React testing with `testRender`

**Canonical:** https://opentui.com/docs/core-concepts/testing/

## When to use

Use `testRender` when React reconciliation, effects, hooks, or JSX behavior is part of the contract. Use Core `createTestRenderer` directly for Core-only renderables and parser behavior.

## Imports and setup

```tsx
import { testRender } from "@opentui/react/test-utils"

function App() {
  return <text>Ready</text>
}

const setup = await testRender(<App />, { width: 30, height: 5 })
try {
  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  if (!frame.includes("Ready")) throw new Error(`Unexpected frame: ${frame}`)
} finally {
  setup.renderer.destroy()
}
```

`testRender(node, testRendererOptions)` creates a Core test renderer, mounts a React root inside `act()`, and returns the Core test setup. Import `testRender` from `@opentui/react/test-utils`; import Core test drivers from `@opentui/core/testing` when needed.

## Lifecycle and pitfalls

- `testRender` wraps renderer `onDestroy` to unmount the React root inside `act()` and restore React's act environment. Destroy the renderer in `finally` or test teardown.
- `root.unmount()` alone does not release the test renderer. Renderer destruction is the resource boundary.
- Use `renderOnce()` for one controlled frame; use `waitForFrame()` when effects or scheduled work render asynchronously.
- Drive keyboard and paste through `setup.mockInput`, mouse through `setup.mockMouse`, and assert captured frames/spans—not terminal stdout.
- Do not assert exact time-to-first-draw values or implementation details. Test observable text, state transitions, event cleanup, and failure behavior.
- Strict-mode remounts can expose missing subscription cleanup. Hooks should not accumulate listeners after unmount/remount.

## Core boundary

`testRender` is React test glue. `createTestRenderer`, `renderOnce`, `waitForFrame`, `captureCharFrame`, `mockInput`, `mockMouse`, and renderer destruction are Core testing APIs.

## Canonical sources

- React test utility source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/test-utils.ts>
- React test entrypoint: <https://opentui.com/docs/reference/api-index/#entry-point-index>
- Core testing docs: <https://opentui.com/docs/core-concepts/testing/>
- React bindings lifecycle: <https://opentui.com/docs/bindings/react/#lifecycle-and-cleanup>
