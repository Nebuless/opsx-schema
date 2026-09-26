# `useKeyboard`

**Canonical:** https://opentui.com/docs/bindings/react/#usekeyboardhandler-options

## When to use

Use `useKeyboard` for app-level keyboard handling that belongs to the React tree. It subscribes to the Core key handler after mount and removes both listeners on cleanup. It receives press events by default, including repeats; pass `{ release: true }` to also receive release events.

## Imports and setup

```tsx
import { useKeyboard, useRenderer } from "@opentui/react"

function App() {
  const renderer = useRenderer()

  useKeyboard((event) => {
    if (event.name === "escape") renderer.destroy()
  })

  return <text>Press Escape to quit</text>
}
```

`handler` receives Core `KeyEvent`. `event.eventType` distinguishes press and release; `event.repeated` marks a repeated press. Release handling:

```tsx
useKeyboard(
  (event) => {
    if (event.eventType === "release") setPressed((current) => current.filter((name) => name !== event.name))
    else setPressed((current) => [...new Set([...current, event.name])])
  },
  { release: true },
)
```

## Lifecycle and pitfalls

- Hook subscription is React binding behavior; event parsing and `KeyEvent` are Core behavior.
- The binding keeps callback identity stable while calling the latest callback, so inline handlers do not resubscribe every render.
- Hook cleanup removes `keypress` and, when enabled, `keyrelease`. Do not add a second manual subscription for the same component.
- Keyboard input is not renderable focus traversal. Core tracks one focused renderable and provides no automatic Tab order; choose focus targets explicitly.
- Do not call `process.exit()` as normal UI cleanup. Let the owner call `renderer.destroy()` so terminal state restores.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-keyboard.ts>
- React hooks: <https://opentui.com/docs/bindings/react/#usekeyboardhandler-options>
- Core keyboard API: <https://opentui.com/docs/core-concepts/keyboard/>
- Core interaction and focus: <https://opentui.com/docs/core-concepts/interaction/>
