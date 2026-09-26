# Select

Use `<select>` for discrete choices in a vertical list. It maps to Core `SelectRenderable`; choose `<tab-select>` for horizontal peer views.

**Canonical:** https://opentui.com/docs/components/select/

## React binding

`<select>` is automatic in `@opentui/react`. Pass `options` as `{ name: string; description: string; value?: any }[]`. React callbacks are `onChange?: (index, option) => void` for highlight movement and `onSelect?: (index, option) => void` for Enter selection. `focused` requests keyboard focus.

Import `createRoot` from `@opentui/react`; import `createCliRenderer` and `SelectOption` from `@opentui/core` in app setup or type declarations. No select registration is needed.

```tsx
import type { SelectOption } from "@opentui/core"
import { useState } from "react"

const options: SelectOption[] = [
  { name: "Open", description: "Browse files", value: "open" },
  { name: "Quit", description: "Close app", value: "quit" },
]

function Menu() {
  const [highlight, setHighlight] = useState(0)
  return (
    <select
      width={32}
      height={6}
      options={options}
      focused
      onChange={(index) => setHighlight(index)}
      onSelect={(_, option) => console.log(option?.value)}
    />
  )
}
```

Use a typed Core ref when a command must move or commit selection:

```tsx
import type { SelectRenderable } from "@opentui/core"
import { useRef } from "react"

const menuRef = useRef<SelectRenderable>(null)
return <select ref={menuRef} options={options} />
```

Exact options include `selectedIndex`, `showDescription`, `showScrollIndicator`, `showSelectionIndicator`, `wrapSelection`, `itemSpacing`, and `fastScrollStep`, plus color options. `onChange` can receive `option === null` for an empty list; `onSelect` does not fire without an option. Highlight state and committed selection are different states.

## Focus and terminal interaction

When focused, Up/Down (or `k`/`j`) move, Shift+Up/Down fast-scroll, and Enter commits. Boundary movement can still emit `SELECTION_CHANGED` in Core; do not assume every change means a different index. Keep one parent focus state; OpenTUI does not provide automatic Tab traversal. Include descriptions or a nearby `<text>` status line so choices remain understandable without color alone.

## Core boundary

React callbacks are the binding for Core `SelectRenderableEvents.SELECTION_CHANGED` and `ITEM_SELECTED`. Core-only control uses `new SelectRenderable(renderer, options)`, `.focus()`, `.getSelectedIndex()`, `.getSelectedOption()`, `.setSelectedIndex()`, `.moveUp()`, `.moveDown()`, and `.selectCurrent()`. Import `useRef` from `react` and `SelectRenderable` from `@opentui/core`; use a `ref` for those imperative operations.

## Canonical sources

- [Select component docs](https://opentui.com/docs/components/select/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Select.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Select.ts)
