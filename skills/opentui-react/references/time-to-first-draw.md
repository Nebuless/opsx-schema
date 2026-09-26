# `TimeToFirstDraw`

**Canonical:** https://opentui.com/docs/components/time-to-first-draw/#react

## When to use

Use `TimeToFirstDraw` as a rendering diagnostic when you need the first-draw `performance.now()` reading visible in the UI. It is not an elapsed startup-duration measurement.

## Imports and setup

```tsx
import { TimeToFirstDraw } from "@opentui/react"

function Diagnostics() {
  return <TimeToFirstDraw label="First draw timestamp" precision={1} fg="#94a3b8" />
}
```

The React binding exports `TimeToFirstDraw` and `TimeToFirstDrawProps`, and registers the `time-to-first-draw` intrinsic automatically. `precision` should be an integer from 0 through 100.

## Lifecycle and pitfalls

- React wrapper creates the Core `TimeToFirstDrawRenderable`; Core captures the timestamp on its first draw and keeps it until `reset()`.
- The displayed number is runtime-relative `performance.now()`, not time since renderer creation or process start.
- Use it for diagnostics, not business timing or performance assertions. For tests, assert observable frame text after a draw rather than an exact timestamp.
- The wrapper accepts normal Core renderable layout options. JSX `style` and props are OpenTUI options, not CSS.
- Imperative reset requires a ref to the underlying renderable; avoid rebuilding component solely to reset timing.

## Core boundary

`TimeToFirstDraw` is React binding API. `TimeToFirstDrawRenderable`, `runtimeMs`, `reset()`, drawing, and precision normalization are Core APIs.

## Canonical sources

- React source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/time-to-first-draw.tsx>
- React component docs: <https://opentui.com/docs/components/time-to-first-draw/#react>
- Core diagnostic docs: <https://opentui.com/docs/components/time-to-first-draw/>
