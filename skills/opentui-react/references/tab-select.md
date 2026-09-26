# TabSelect

Use `<tab-select>` for one selected item in a horizontal tab strip. It maps to Core `TabSelectRenderable`; use `<select>` for a vertical menu.

**Canonical:** https://opentui.com/docs/components/tab-select/

## React binding

The intrinsic name is exactly kebab-case: `<tab-select>`. It is automatic in `@opentui/react`. `options` contains `{ name: string; description: string }` objects (and optional `value`), while `focused`, `onChange?: (index, option) => void`, and `onSelect?: (index, option) => void` are React-facing props.

Import `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core` in app bootstrap. No component-specific registration is needed.

```tsx
function Tabs({ active, setActive }: { active: number; setActive: (n: number) => void }) {
  return (
    <tab-select
      width={48}
      tabWidth={16}
      options={[
        { name: "Home", description: "Overview" },
        { name: "Files", description: "Browse files" },
        { name: "Settings", description: "Configure app" },
      ]}
      focused
      onChange={(index) => setActive(index)}
      onSelect={(index) => console.log("commit", index)}
      showDescription
      showUnderline
      showScrollArrows
    />
  )
}
```

Use a typed Core ref when a command must set tabs directly:

```tsx
import type { TabSelectRenderable, TabSelectOption } from "@opentui/core"
import { useRef } from "react"

const options: TabSelectOption[] = [{ name: "Home", description: "Overview" }]
const tabsRef = useRef<TabSelectRenderable>(null)
return <tab-select ref={tabsRef} options={options} />
```

Exact options include `width`, `tabWidth`, `backgroundColor`, `textColor`, `focusedBackgroundColor`, `focusedTextColor`, `selectedBackgroundColor`, `selectedTextColor`, `selectedDescriptionColor`, `showScrollArrows`, `showDescription`, `showUnderline`, `wrapSelection`, `keyBindings`, and `keyAliasMap`.

## Focus and composition

Focused tabs consume Left/Right (or `[`/`]`) and Enter commits the current tab. The strip automatically scrolls horizontally when tabs exceed width. Use `onChange` to preview/switch content while moving, or `onSelect` when content should change only after Enter; do not conflate those transitions. Keep tab labels and descriptions meaningful in monochrome terminals. Parent owns focus; there is no automatic Tab traversal.

## Core boundary

React callbacks correspond to Core `TabSelectRenderableEvents.SELECTION_CHANGED` and `ITEM_SELECTED`. Core-only methods include `.focus()`, `.getSelectedIndex()`, `.setSelectedIndex()`, and `.setOptions()`; import `useRef` from `react` and `TabSelectRenderable` from `@opentui/core`, then use a `ref` for imperative calls. Core construction is `new TabSelectRenderable(renderer, options)`. React reconciler owns mounted renderable lifetime.

## Canonical sources

- [TabSelect component docs](https://opentui.com/docs/components/tab-select/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `TabSelect.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/TabSelect.ts)
