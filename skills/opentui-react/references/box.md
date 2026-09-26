# Box

Use `<box>` as React layout/container surface. It maps to Core `BoxRenderable`; choose it for flex layout, backgrounds, borders, titles, padding, and mouse-interactive regions. Use `<scrollbox>` when child content must scroll.

**Canonical:** https://opentui.com/docs/components/box/

## React binding

`<box>` is automatic in `@opentui/react`; no registration call is needed. JSX names stay kebab-case. Props are Core `BoxOptions` plus `children`, `ref`, and React `key`; put ordinary options directly on the element or inside `style`. `style` is OpenTUI options, not CSS.

Import `createRoot` from `@opentui/react` and create the Core renderer with `createCliRenderer` from `@opentui/core` in the application bootstrap; component files only need React imports used by their props.

```tsx
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <box
      border
      borderStyle="rounded"
      padding={1}
      flexDirection="column"
      gap={1}
      title="Details"
    >
      {children}
    </box>
  )
}
```

For Core methods or inspection, type the ref with the Core renderable:

```tsx
import type { BoxRenderable } from "@opentui/core"
import { useRef } from "react"

const panelRef = useRef<BoxRenderable>(null)
return <box ref={panelRef} />
```

Common exact options: `width`, `height`, `backgroundColor`, `border`, `borderStyle`, `borderColor`, `title`, `titleColor`, `titleAlignment`, `bottomTitle`, `bottomTitleAlignment`, `padding`, `gap`, `flexDirection`, `justifyContent`, and `alignItems`. Children are renderables; put inline text only inside `<text>`.

## Focus, interaction, composition

A box is not automatically a focus traversal system. `<box focused>` requests focus on its Core renderable, but applications must own focus state and route `Tab`/other keys. `onMouseDown`, `onMouseOver`, and `onMouseOut` are Core event props exposed by the React binding; update React state rather than mutating visual state from render.

Terminal dimensions are cells. Set explicit dimensions or let parent flex layout size children. Border and padding consume cells, so reserve space for them. Use `<text>` for labels and `<input>`, `<select>`, or `<textarea>` for focused controls.

## Core boundary

React reconciles `<box>` into `BoxRenderable`. Imperative Core-only work uses `new BoxRenderable(renderer, options)`, `.add()`, `.remove()`, and direct property assignment. A React ref can expose the mounted Core instance when imperative behavior is required; import `useRef` from `react` and `BoxRenderable` from `@opentui/core`; do not create a second renderable beside the JSX one.

## Canonical sources

- [Box component docs](https://opentui.com/docs/components/box/)
- [React component catalogue](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/index.ts)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Box.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Box.ts)
