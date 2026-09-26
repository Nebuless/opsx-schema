# ScrollBox

Use `<scrollbox>` for bounded, scrollable child content with clipping and managed scrollbars. It maps to Core `ScrollBoxRenderable`; use `<box>` when content should not scroll.

**Canonical:** https://opentui.com/docs/components/scrollbox/

## React binding

`<scrollbox>` is automatic in `@opentui/react` and accepts children. Core options include `scrollX` (default `false`), `scrollY` (default `true`), `stickyScroll`, `stickyStart`, `viewportCulling`, `scrollAcceleration`, `rootOptions`, `wrapperOptions`, `viewportOptions`, `contentOptions`, `scrollbarOptions`, `verticalScrollbarOptions`, and `horizontalScrollbarOptions`.

Import `createRoot` from `@opentui/react`; import `createCliRenderer` and `ScrollBoxRenderable` from `@opentui/core` in app setup or ref types. No scrollbox registration is needed.

```tsx
import type { ScrollBoxRenderable } from "@opentui/core"
import { useEffect, useRef } from "react"

function Log({ lines }: { lines: string[] }) {
  const ref = useRef<ScrollBoxRenderable>(null)
  useEffect(() => {
    ref.current?.scrollTo({ y: Number.MAX_SAFE_INTEGER })
  }, [lines.length])
  return (
    <scrollbox ref={ref} width={70} height={12} stickyScroll stickyStart="bottom">
      {lines.map((line, i) => <text key={i}>{line}</text>)}
    </scrollbox>
  )
}
```

Use `stickyScroll` together with `stickyStart`; `stickyStart` has no default. Read/write `scrollTop` and `scrollLeft`; inspect read-only `scrollWidth` and `scrollHeight`. Keyboard focus enables arrows, Page Up/Down, Home, and End. Set `focused` when the scrollbox itself should capture navigation.

## Culling and state hazards

`viewportCulling` defaults to true. Offscreen children can skip render calls, so their `renderBefore` and `renderAfter` hooks do not run. Never make layout or state depend on those hooks. Disable culling when every child must execute render hooks. Give a viewport an explicit height, or scrolling has no useful bounded region. When focusing an offscreen child, call Core `.scrollChildIntoView(id)` through a ref after the child exists.

## Core boundary

React children reconcile into Core content. Core-only methods include `.scrollBy()`, `.scrollTo()`, `.scrollChildIntoView()`, and access to `.wrapper`, `.viewport`, `.content`, and scrollbar renderables. Use `ref` for imperative scrolling; do not manually destroy a React-mounted `ScrollBoxRenderable`.

## Canonical sources

- [ScrollBox component docs](https://opentui.com/docs/components/scrollbox/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `ScrollBox.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/ScrollBox.ts)
