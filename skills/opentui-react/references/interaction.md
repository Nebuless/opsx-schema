# Interaction, focus, and selection

**Canonical:** https://opentui.com/docs/core-concepts/interaction/

## When to use

Use this reference for keyboard focus, mouse handlers, terminal-window focus, drag behavior, and text selection in React OpenTUI apps.

## Imports and setup

React hooks cover terminal events; intrinsic handlers map to Core mouse events:

```tsx
import { useKeyboard, useFocus, useBlur } from "@opentui/react"

function App() {
  useKeyboard((key) => { if (key.name === "escape") console.log("close") })
  useFocus(() => console.log("terminal focused"))
  useBlur(() => console.log("terminal blurred"))
  return <box onMouseDown={(event) => event.preventDefault()}><text>Interact</text></box>
}
```

Use `useRenderer` when setting renderer-wide mouse or pointer behavior. Mouse handlers include `onMouseDown`, `onMouseUp`, `onMouseMove`, `onMouseDrag`, `onMouseDragEnd`, `onMouseDrop`, `onMouseOver`, `onMouseOut`, and `onMouseScroll`.

## React/Core boundary

React supplies handlers, refs, and state. Core performs hit testing, event bubbling, focus ownership, pointer capture, and selection. Mouse coordinates are zero-based renderer cells. Core has one focused renderable and one global text selection per renderer; terminal window focus is separate and does not focus a renderable.

There is no synthetic `click` event and no automatic Tab traversal. A click is `down` plus `up`; choose the next focusable renderable and call its `focus()` through a ref. `focus()` only works when `focusable` is true. Inputs, textareas, selects, tab selects, scroll boxes, and scroll bars are focusable by default.

## Lifecycle and interaction pitfalls

- Left-button down normally focuses the nearest focusable target and can clear selection. `preventDefault()` prevents those renderer defaults but does not stop propagation; use `stopPropagation()` for bubbling.
- `onMouseOver`/`onMouseOut` are hit-target changes and bubble; they are not browser enter/leave events.
- Left-button drags capture to their source. On release, source gets `drag-end` and `up`; destination gets `drop` and `up`.
- Set `selectable={false}` on text that should not enter global selection. Selection offsets count display cells, not UTF-16 indexes.
- Keep keyboard alternatives and visible focus state; pointer styles use terminal OSC 22 and may be ignored.
- Renderer destruction restores pointer state and terminal resources. React `root.unmount()` alone does not.

## Canonical sources

- [Interaction, focus, and selection](https://opentui.com/docs/core-concepts/interaction/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [Keyboard input](https://opentui.com/docs/core-concepts/keyboard/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
