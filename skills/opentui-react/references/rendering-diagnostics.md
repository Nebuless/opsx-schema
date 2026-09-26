# Rendering diagnostics

**Canonical:** https://opentui.com/docs/test-and-debug/rendering-diagnostics/

## When to use

Use this reference when a React app is blank, slow, stale, over-rendering, or tests cannot settle. Diagnose output, scheduler state, native frames, and cell changes separately.

## Imports and setup

React can log renderer diagnostics through `useRenderer`; Core exposes the counters:

```tsx
import { useRenderer } from "@opentui/react"

function Diagnostics() {
  const renderer = useRenderer()
  const stats = renderer.getNativeStats()
  console.log(renderer.getSchedulerState(), stats.cellsUpdated)
  return <text>{`frames: ${stats.nativeFrameCount}`}</text>
}
```

For first-draw timing, use the React `TimeToFirstDraw` component. For test output use `captureCharFrame`, `captureSpans`, `getNativeStats`, and `waitForVisualIdle` from the test setup.

## React/Core boundary

React controls reconciliation and effects. Core controls scheduling, frame identifiers, native rendering, cell diffing, terminal output, and stats. `renderer.frameId` counts JavaScript loop attempts; a `frame` event means a pass reached rendered state. `cellsUpdated` counts changed terminal cells, not bytes, graphemes, nodes, or code points.

Key diagnostics:

- `renderer.getSchedulerState()` → `isRunning`, `isRendering`, `hasScheduledRender`.
- `renderer.getNativeStats()` → native frame count, changed cells, frame and write timings.
- `renderer.getStats()` → JavaScript frame counts and timings when `gatherStats: true`.
- `renderer.console` / console overlay → captured application logs without corrupting UI.
- `renderer.configureDebugOverlay({ enabled: true, corner })` or `OTUI_SHOW_STATS=true` → native stats overlay.

## Lifecycle and diagnostics pitfalls

- `renderer.idle()` waits scheduler/feed-idle work and resolves after destruction; it does not require a zero-cell-update frame.
- `TimeToFirstDraw` stores a `performance.now()` timestamp, not elapsed startup time. Subtract an app start reading.
- `OTUI_NO_NATIVE_RENDER` still allows some ANSI output; use only for bounded diagnosis and remove afterward.
- `OTUI_STDIN_LOG`, `OTUI_DUMP_CAPTURES`, and debug logs can contain sensitive app input/output. Protect and delete captures.
- Renderer logs sent to stdout can overwrite the UI under some output modes; prefer `renderer.console`.

## Canonical sources

- [Rendering diagnostics](https://opentui.com/docs/test-and-debug/rendering-diagnostics/)
- [Testing](https://opentui.com/docs/core-concepts/testing/)
- [Time to first draw](https://opentui.com/docs/components/time-to-first-draw/)
- [Renderer](https://opentui.com/docs/core-concepts/renderer/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
