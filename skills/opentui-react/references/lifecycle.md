# Renderer and React lifecycle

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/renderer.ts

## When to use

Use when designing startup/shutdown, effects, cleanup, renderer destruction, or error paths.

## Minimal pattern

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { useEffect } from "react"

function App() {
  useEffect(() => {
    const timer = setInterval(() => {}, 1000)
    return () => clearInterval(timer)
  }, [])
  return <text content="Running" />
}

const renderer = await createCliRenderer()
const root = createRoot(renderer)
try {
  root.render(<App />)
} catch (error) {
  root.unmount()
  renderer.destroy()
  throw error
}
```

React `useEffect` cleanup runs when the tree unmounts. Use it for timers, subscriptions, and Core event listeners created by a component. Keep renderer-wide resources with the renderer owner, not in unrelated component effects.

The binding registers cleanup for Core `CliRenderEvents.DESTROY`: it updates the React container to `null`, flushes reconciler work, and drops its container reference. Core renderer destruction remains application responsibility. Renderer destruction can already detach the renderable tree while React deletion effects run; cleanup must tolerate that ordering and must not attempt to use destroyed renderables.

## Lifecycle, focus, and state pitfalls

React effects, `Root.unmount`, and reconciliation are **React binding/React** lifecycle mechanisms. `createCliRenderer`, `CliRenderEvents.DESTROY`, `renderer.destroy()`, render scheduling, and terminal restoration are **OpenTUI Core** mechanisms.

- Pair `renderer = await createCliRenderer()` with `renderer.destroy()` in the same owner.
- `root.unmount()` is required for React-side cleanup when stopping before renderer destruction, but is not a replacement for `renderer.destroy()`.
- Do not call Core renderable methods after renderer destruction.
- Avoid process-wide `process.exit()` before cleanup unless shutdown path already destroyed renderer.
- React state/effects do not create automatic focus traversal; keep one explicit focus state and pass `focused` to focusable Core-backed components.

## Canonical sources

- [React root cleanup implementation](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/renderer.ts)
- [React reconciler host lifecycle](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/host-config.ts)
- [Core renderer lifecycle](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderer.ts)
