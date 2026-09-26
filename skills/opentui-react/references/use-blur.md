# `useBlur`

**Canonical:** https://opentui.com/docs/bindings/react/#useblurhandler

## When to use

Use `useBlur` when a terminal window focus-loss report should pause nonessential work or reflect inactive state. It does not blur a React component or Core renderable.

## Imports and setup

```tsx
import { useBlur } from "@opentui/react"

function Activity() {
  useBlur(() => pausePolling())
  return <text>Blur-aware</text>
}
```

`useBlur(handler)` subscribes to Core renderer `blur` events after mount. Handler takes no arguments and returns nothing.

## Lifecycle and pitfalls

- React binding keeps callback identity stable and removes listener during effect cleanup. Do not add duplicate manual subscriptions for same component.
- Terminal blur reports depend on terminal capability support. No event does not prove app or control kept focus.
- This surface does not modify focused renderable. Use `focused` props or a Core renderable ref plus `.blur()` for control focus.
- React owns hook effect lifetime. Core owns renderer event emission, capability detection, and focused-renderable state.

## Canonical sources

- [React blur hook source](https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-blur.ts)
- [React bindings](https://opentui.com/docs/bindings/react/#useblurhandler)
- [Core interaction](https://opentui.com/docs/core-concepts/interaction/#terminal-focus-reports)
