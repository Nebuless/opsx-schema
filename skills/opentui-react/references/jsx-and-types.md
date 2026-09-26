# JSX and TypeScript types

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#typescript-configuration

## When to use

Use when configuring a TypeScript React OpenTUI app or diagnosing JSX intrinsic/prop errors.

## Imports and setup

Use the automatic JSX runtime supplied by `@opentui/react`:

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "strict": true,
    "skipLibCheck": true
  }
}
```

The package exports `@opentui/react/jsx-runtime` and `@opentui/react/jsx-dev-runtime`; the JSX namespace declares OpenTUI intrinsic props. Use normal React imports for hooks and `@opentui/react` for binding APIs:

```tsx
import { createRoot } from "@opentui/react"
import { useState } from "react"

function App() {
  const [value, setValue] = useState("")
  return <text content={value} />
}
```

Built-in intrinsic names are exact kebab-case names: `box`, `text`, `input`, `textarea`, `select`, `tab-select`, `scrollbox`, `code`, `markdown`, `diff`, `line-number`, `ascii-font`, `image`, `span`, `b`, `strong`, `i`, `em`, `u`, `br`, and `a`. PascalCase is for ordinary React components such as `TimeToFirstDraw`, not for built-in intrinsic names.

`style` is typed as a partial subset of each Core options object after non-style props are removed. It is not `CSSProperties`; use OpenTUI option names and terminal-cell dimensions.

## Lifecycle, focus, and state pitfalls

This file documents **React binding** JSX/types. Renderable option definitions and behavior remain **OpenTUI Core** APIs. TypeScript acceptance does not make a Core renderable available: built-ins come from the binding catalogue, while extensions need runtime registration; see [custom-components.md](custom-components.md) and [component-availability.md](component-availability.md).

- `<text>` and text modifiers accept text children; ordinary text children outside `<text>` throw at reconciliation.
- `ref` targets the corresponding Core renderable type, not a DOM node.
- Keep intrinsic names lowercase and kebab-case exactly.
- JSX types do not own lifecycle or focus state; use React state/effects and Core focus props/methods through refs.

## Canonical sources

- [React TypeScript configuration](https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#typescript-configuration)
- [JSX namespace declarations](https://github.com/anomalyco/opentui/blob/main/packages/react/jsx-namespace.d.ts)
- [React component type definitions](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core option and renderable exports](https://github.com/anomalyco/opentui/blob/main/packages/core/src/index.ts)
