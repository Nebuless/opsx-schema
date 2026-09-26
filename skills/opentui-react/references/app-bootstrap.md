# Application bootstrap

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#quick-start

## When to use

Use when starting an OpenTUI React process: create one Core `CliRenderer`, create one React root for it, render app, and destroy renderer during shutdown.

## Imports and setup

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

function App() {
  return <text>Hello, OpenTUI</text>
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
const root = createRoot(renderer)

try {
  root.render(<App />)
} catch (error) {
  root.unmount()
  renderer.destroy()
  throw error
}
```

`createCliRenderer()` is an **OpenTUI Core** API. `createRoot()` and `Root.render()` are **React binding** APIs. `createRoot` adopts the supplied renderer; it does not create or own it. Keep renderer creation and destruction in the same application owner. `renderer.destroy()` is the Core terminal cleanup operation; `root.unmount()` only removes the React tree.

For normal application shutdown, call `renderer.destroy()` (or let configured Core shutdown handling do so). The React root listens for Core `CliRenderEvents.DESTROY` and cleans its container, so do not create multiple roots for one renderer.

## Lifecycle, focus, and state pitfalls

- Do not use browser `ReactDOM.createRoot`; OpenTUI's `createRoot(renderer)` requires a Core `CliRenderer`.
- Do not write application logs to stdout while it is owned by the renderer; use `renderer.console` where appropriate.
- `root.unmount()` does not restore terminal state. Destroy the renderer on every explicit shutdown/error path.
- `style` values are OpenTUI component options, not CSS; dimensions are terminal cells.
- Bootstrap owns renderer lifetime; React state and focus state belong in app components, not in a second renderer or root.

## Canonical sources

- [React quick start and bootstrap](https://github.com/anomalyco/opentui/blob/main/packages/react/README.md#quick-start)
- [React root implementation](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/renderer.ts)
- [Core renderer API](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderer.ts)
