# Layout

**Canonical:** https://opentui.com/docs/core-concepts/layout/

## When to use

Use this reference when a React screen wraps, sizes, aligns, or adapts to terminal resize. `@opentui/react` maps JSX to Core renderables; Yoga computes geometry in terminal cells, not pixels, CSS boxes, or string lengths.

## Imports and setup

React uses layout props inside JSX `style`; these are OpenTUI options, never browser CSS:

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

const renderer = await createCliRenderer()
createRoot(renderer).render(
  <box style={{ width: "100%", height: "100%", flexDirection: "row", gap: 1 }}>
    <box style={{ width: 12, flexShrink: 0 }} />
    <box style={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }} />
  </box>,
)
```

Supported families include `width`/`height`, min/max dimensions, margin, padding, `flexGrow`, `flexShrink`, `flexBasis`, `flexDirection`, `flexWrap`, `alignItems`, `alignSelf`, `justifyContent`, `gap`/`rowGap`/`columnGap`, `position`, edges, and `overflow`. `gap` belongs to `<box>`.

## React/Core boundary

React owns JSX reconciliation and state. Core owns Yoga measurement, computed `x`/`y`/`width`/`height`, terminal resize, clipping, and cell rounding. Use `ref`s or Core renderable APIs for imperative geometry; do not expect DOM layout APIs. `<text>` controls line alignment with `textAlign`; Yoga alignment positions its box, not its characters.

## Lifecycle and layout pitfalls

- Numeric initial dimensions default `flexShrink` to `0`; set `flexShrink` when a child must contract.
- Percentages need a definite parent dimension. Absolute children do not contribute to automatic parent size.
- `overflow: "scroll"` clips but does not create scroll state; use `<scrollbox>`.
- `wrapMode: "word"` or `"char"` can increase measured height under a width constraint. Intrinsic measurement uses display-cell width.
- Yoga rounds computed edges to whole cells. Fractional flex and percentage results can distribute an extra cell among siblings.
- On resize, existing renderables remain; Core reruns Yoga. React's `useOnResize` or `useTerminalDimensions` is for app state, not manual layout math.

## Canonical sources

- [OpenTUI Layout](https://opentui.com/docs/core-concepts/layout/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
