# Custom components and catalogue extension

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/docs/EXTEND.md

## When to use

Use when a Core renderable is needed as JSX intrinsic but is not one of `@opentui/react` built-ins.

## Imports and setup

Custom intrinsic components are Core renderable classes. Register them before rendering and augment the React binding module for type checking:

```tsx
import { BoxRenderable, type BoxOptions, type RenderContext } from "@opentui/core"
import { createRoot, extend } from "@opentui/react"

class ConsoleButton extends BoxRenderable {
  constructor(ctx: RenderContext, options: BoxOptions & { label?: string }) {
    super(ctx, options)
  }
}

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "console-button": typeof ConsoleButton
  }
}

extend({ "console-button": ConsoleButton })

function App() {
  return <console-button label="Run" style={{ border: true }} />
}
```

A constructor must match the Core renderable constructor shape `(ctx: RenderContext, options)`. Extend an appropriate Core base (`BoxRenderable`, `TextRenderable`, or another Core renderable), and call `requestRender()` in custom setters when a changed property must trigger a redraw.

`extend(objects)` mutates the process-wide React binding catalogue and returns `void`. `getComponentCatalogue()` reads current catalogue. Names must be unique; registration is runtime state, so module augmentation alone does not register anything.

## Lifecycle, focus, and state pitfalls

`extend`, `OpenTUIComponents`, `ExtendedComponentProps`, and JSX catalogue wiring are **React binding** APIs. Custom classes, constructors, options, render methods, `requestRender()`, and renderable ownership are **OpenTUI Core** APIs.

- Register before `createRoot(...).render(...)`.
- JSX intrinsic name must match catalogue key exactly. Use kebab-case for names intended as kebab-case; the catalogue is string-keyed.
- Module augmentation supplies TypeScript types only; it does not call `extend`.
- `style` remains Core options, not CSS.
- Custom renderables own their Core lifecycle; React state changes reach them through reconciler props, while focus still needs explicit `focused` state or Core ref methods.

## Canonical sources

- [Official extension guide](https://github.com/anomalyco/opentui/blob/main/packages/react/docs/EXTEND.md)
- [Catalogue and extend implementation](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/index.ts)
- [Extended component type definitions](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core renderable base exports](https://github.com/anomalyco/opentui/blob/main/packages/core/src/index.ts)
