# `useFocus`

**Canonical:** https://opentui.com/docs/bindings/react/#usefocushandler

## When to use

Use `useFocus` when terminal window focus reports should resume work, refresh transient state, or update visible status. It does not focus a React component or Core renderable.

## Imports and setup

```tsx
import { useFocus } from "@opentui/react"

function Activity() {
  useFocus(() => refreshStatus())
  return <text>Focus-aware</text>
}
```

`useFocus(handler)` subscribes to Core renderer `focus` events after mount. Handler takes no arguments and returns nothing.

## Lifecycle and pitfalls

- React binding keeps callback identity stable and removes listener during effect cleanup. Do not add duplicate manual subscriptions for same component.
- Terminal focus reports depend on terminal capability support. No event does not prove app or control lost focus.
- This surface does not modify focused renderable. Use `focused` props or a Core renderable ref plus `.focus()` for input focus.
- React owns hook effect lifetime. Core owns renderer event emission, capability detection, and focused-renderable state.

## Canonical sources

- [React focus hook source](https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-focus.ts)
- [React bindings](https://opentui.com/docs/bindings/react/#usefocushandler)
- [Core interaction](https://opentui.com/docs/core-concepts/interaction/#terminal-focus-reports)
