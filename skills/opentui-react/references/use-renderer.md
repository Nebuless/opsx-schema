# `useRenderer`

**Canonical:** https://opentui.com/docs/bindings/react/#userenderer

## When to use

Use `useRenderer` inside a React tree created with `createRoot(renderer)` when code needs renderer-owned services or Core events. It returns the current `CliRenderer` from AppContext.

## Imports and setup

```tsx
import { useEffect } from "react"
import { useRenderer } from "@opentui/react"

function ConsoleNotice() {
  const renderer = useRenderer()

  useEffect(() => {
    renderer.console.show()
    console.log("ready")
  }, [renderer])

  return <text>Ready</text>
}
```

Calling the hook outside an OpenTUI React root throws `Error("Renderer not found.")`.

## Lifecycle and pitfalls

- The hook reads context; it does not create, start, or destroy a renderer.
- The code that calls `createCliRenderer()` owns `renderer.destroy()` on every shutdown path. `root.unmount()` removes React nodes but does not release terminal resources.
- Use React effects for event subscriptions and return `off` cleanup. Prefer renderer services such as `renderer.console` over writing directly to stdout.
- Renderer APIs, dimensions, focus, selection, scheduling, and events are Core APIs even when accessed from React.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-renderer.ts>
- React lifecycle: <https://opentui.com/docs/bindings/react/#lifecycle-and-cleanup>
- Core renderer: <https://opentui.com/docs/core-concepts/renderer/>
- Core lifecycle: <https://opentui.com/docs/core-concepts/lifecycle/>
