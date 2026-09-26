# `useTimeline`

**Canonical:** https://opentui.com/docs/application-apis/animation/

## When to use

Use `useTimeline` for numeric animation owned by a React component. The hook creates one Core `Timeline` for the mounted component, registers it with the Core animation engine, and unregisters it on unmount.

## Imports and setup

```tsx
import { useEffect, useState } from "react"
import { useTimeline } from "@opentui/react"

function MovingPanel() {
  const [width, setWidth] = useState(4)
  const timeline = useTimeline({ duration: 300, autoplay: false })

  useEffect(() => {
    timeline.add(
      { width },
      {
        width: 30,
        duration: 300,
        ease: "outQuad",
        onUpdate: (animation) => setWidth(animation.targets[0].width),
      },
    )
    timeline.play()
  }, [timeline])

  return <box style={{ width, height: 1 }} />
}
```

`Timeline.add` animates existing top-level numeric properties. For renderable properties, pass the renderable as target; for React state, copy numeric values from `onUpdate`.

## Lifecycle and pitfalls

- The hook stores the timeline once. Changing `options` on later renders does not recreate or reconfigure it.
- By default the mount effect calls `timeline.play()`. `{ autoplay: false }` leaves it paused until `play()`.
- Cleanup pauses the timeline and calls `engine.unregister(timeline)`. Do not register the same timeline manually.
- Keep `onUpdate` work small. A callback throwing propagates through the animation update path.
- `duration` and animation item durations are milliseconds. Animate writable, existing numeric properties; nested paths and non-numeric end values are unsupported.

## Core boundary

`useTimeline` is React lifecycle integration. `Timeline`, `engine`, easing names, `add`, `play`, `pause`, and renderer live scheduling are Core APIs.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-timeline.ts>
- React animation docs: <https://opentui.com/docs/bindings/react/#usetimelineoptions>
- Core animation and Timeline: <https://opentui.com/docs/application-apis/animation/>
