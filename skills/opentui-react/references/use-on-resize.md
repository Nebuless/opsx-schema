# `useOnResize`

**Canonical:** https://opentui.com/docs/bindings/react/#useonresizecallback

## When to use

Use `useOnResize` when a component needs an imperative response to terminal render-region changes. The callback receives `(width, height)` in terminal cells.

## Imports and setup

```tsx
import { useOnResize, useRenderer } from "@opentui/react"

function ResizeLog() {
  const renderer = useRenderer()

  useOnResize((width, height) => {
    renderer.console.show()
    console.log(`render region: ${width}x${height}`)
  })

  return <text>Resize-aware</text>
}
```

For UI that should re-render from dimensions, prefer [`use-terminal-dimensions.md`](use-terminal-dimensions.md).

## Lifecycle and pitfalls

- The hook subscribes to the renderer `resize` event after commit and removes the same listener on unmount.
- Callback identity is stabilized internally; latest props and state remain visible without effect resubscription.
- Dimensions are cell counts, not pixels or CSS lengths. In split-footer mode they describe the render region, not the complete terminal.
- Do not assume resize means initial dimensions changed synchronously during render. Read `useTerminalDimensions` or renderer dimensions for current state.
- Avoid expensive synchronous work in the callback; resize can schedule additional rendering.

## Core boundary

`useOnResize` is React subscription glue. `CliRenderer` resize events and `renderer.resize(width, height)` for custom streams are Core APIs.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-resize.ts>
- React docs: <https://opentui.com/docs/bindings/react/#useonresizecallback>
- Core renderer: <https://opentui.com/docs/core-concepts/renderer/#custom-streams>
