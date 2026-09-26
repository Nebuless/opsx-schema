# App context

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/app.tsx

## When to use

Use when a component needs the current OpenTUI `CliRenderer` or its `KeyHandler` without prop drilling.

## Imports and setup

```tsx
import { useAppContext } from "@opentui/react"

function Diagnostics() {
  const { renderer, keyHandler } = useAppContext()

  return <text content={renderer ? "Renderer ready" : "No renderer"} />
}
```

`AppContext` is a React binding context with this public shape:

```ts
interface AppContext {
  keyHandler: KeyHandler | null
  renderer: CliRenderer | null
}
```

`useAppContext()` returns the nearest context value. `createRoot(renderer)` provides `{ keyHandler: renderer.keyInput, renderer }` around the rendered tree. Components rendered outside an OpenTUI root see the default `{ keyHandler: null, renderer: null }`.

## Lifecycle, focus, and state pitfalls

`AppContext` and `useAppContext` are **React binding** APIs. `CliRenderer` and `KeyHandler` are **OpenTUI Core** APIs. The context gives access; it does not change Core ownership or lifecycle.

- Handle `null` when a component can render outside `createRoot`.
- Do not replace the context to manufacture a renderer; create a Core renderer and bind it through `createRoot`.
- Use dedicated binding hooks such as `useKeyboard` for normal keyboard subscriptions; do not mutate `keyHandler` casually.
- Renderer destruction still belongs to the application owner. Context access does not keep renderer alive.
- Context carries renderer/key-handler identity, not component focus or React state; keep focus selection in React state and apply it to focusable intrinsics.

## Canonical sources

- [AppContext and useAppContext source](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/app.tsx)
- [Root provider setup](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/renderer.ts)
- [Core renderer and key input](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderer.ts)
