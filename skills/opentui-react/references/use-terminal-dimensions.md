# `useTerminalDimensions`

**Canonical:** https://opentui.com/docs/bindings/react/#useterminaldimensions

## When to use

Use `useTerminalDimensions` when layout or displayed state must react to terminal resize events. It returns `{ width, height }` and initializes from the current renderer dimensions.

## Imports and setup

```tsx
import { useTerminalDimensions } from "@opentui/react"

function Layout() {
  const { width, height } = useTerminalDimensions()

  return (
    <box style={{ width: Math.max(1, Math.floor(width / 2)), height: Math.max(1, height - 2) }}>
      <text>{`${width}x${height}`}</text>
    </box>
  )
}
```

## Lifecycle and pitfalls

- The hook uses React state plus `useOnResize`; resize subscription is removed when the component unmounts.
- Width and height are terminal cells. They are not browser viewport pixels and `style` remains OpenTUI component options, not CSS.
- Initial dimensions come from `useRenderer()` during render. A resize event updates state after the event arrives.
- Dimensions can change while content is being laid out. Clamp or otherwise handle very small values before deriving child sizes.
- Use `useOnResize` instead when no React render is needed.

## Core boundary

State and subscription are React binding behavior. `renderer.width`, `renderer.height`, and `resize` events are Core renderer state.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-terminal-dimensions.ts>
- React docs: <https://opentui.com/docs/bindings/react/#useterminaldimensions>
- Core renderer: <https://opentui.com/docs/core-concepts/renderer/>
