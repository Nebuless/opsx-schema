# Animation in React

**Canonical:** https://opentui.com/docs/application-apis/animation/

## When to use

Use Core `Timeline` directly for imperative renderables and [`use-timeline.md`](use-timeline.md) for a React-owned animation lifecycle. Both animate mutable numeric properties and depend on Core's animation engine.

## Imports and setup

```tsx
import { createTimeline, engine } from "@opentui/core"

const timeline = createTimeline({ duration: 600, autoplay: false })
timeline.add(box, { left: 30, duration: 600, ease: "outQuad" })
timeline.play()

try {
  await renderer.idle()
} finally {
  timeline.pause()
  engine.unregister(timeline)
  renderer.destroy()
}
```

In React, prefer:

```tsx
const timeline = useTimeline({ duration: 600 })
useEffect(() => {
  timeline.add({ value }, { value: 1, duration: 600, onUpdate: ({ targets }) => setValue(targets[0].value) })
}, [timeline])
```

## Lifecycle and pitfalls

- `createTimeline()` registers with the global engine; `new Timeline()` does not. `useTimeline()` registers on mount and unregisters on cleanup.
- Registered timelines own renderer live scheduling. Do not call `renderer.requestLive()` for the same timeline.
- `Timeline.add` captures existing numeric top-level properties when the item becomes active. Missing, read-only, or non-numeric targets can produce `NaN` or throw.
- Timeline duration is an overall cutoff; it does not automatically expand to fit items. Use finite, non-negative times and positive durations.
- `onUpdate` runs synchronously in update. Keep state updates intentional and clean up timelines before renderer destruction.

## Core boundary

The animation model (`Timeline`, `createTimeline`, `engine`, easing, numeric mutation) is Core. React contributes hook lifetime and state reconciliation only.

## Canonical sources

- Core animation docs: <https://opentui.com/docs/application-apis/animation/>
- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-timeline.ts>
- Renderer live scheduling: <https://opentui.com/docs/core-concepts/renderer/#live-rendering>
