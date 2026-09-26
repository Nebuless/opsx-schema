# React root, portals, and synchronous updates

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/renderer.ts

## When to use

Use when mounting, replacing, unmounting, portaling, or forcing synchronous React updates in an OpenTUI app.

## Imports and setup

```tsx
import { createCliRenderer } from "@opentui/core"
import { createPortal, createRoot, flushSync } from "@opentui/react"
import { useState } from "react"

const renderer = await createCliRenderer()

function App() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <text content="Main content" />
      {open && createPortal(<text content="Overlay" />, renderer.root)}
      <box onMouseDown={() => flushSync(() => setOpen(true))}>
        <text>Show overlay</text>
      </box>
    </>
  )
}

const root = createRoot(renderer)
// `renderer.root` is the Core root renderable used by the normal root.
root.render(<App />)
```

`createRoot(renderer)` returns the React binding `Root` object:

- `render(node: ReactNode): void` commits a React tree to the supplied Core renderer.
- `unmount(): void` removes that React tree and flushes pending React work.

`createPortal` and `flushSync` are re-exported by the React binding. `createPortal(children, container, key?)` uses a Core renderable/container as its target; normal Core tree ownership and parent/child rules still apply. `flushSync(callback)` bypasses normal batching for updates in its callback. Use it only when code must observe committed state immediately; repeated calls can cause extra renders.

## Lifecycle and ownership

The binding attaches React's reconciler to the Core renderer when `render` runs. Calling `root.unmount()` does not destroy the renderer or restore terminal state. The application owner must call `renderer.destroy()`; renderer destruction also triggers root cleanup. See [lifecycle.md](lifecycle.md).

## Lifecycle, focus, and state pitfalls

Root, portal, and `flushSync` exports are **React binding** APIs. `renderer.root`, `renderer.destroy()`, and renderable containers are **OpenTUI Core** APIs. Do not pass a browser DOM node or use `react-dom` APIs.

- Reuse one root per renderer; do not repeatedly call `createRoot` for one renderer.
- A portal does not create a second renderer.
- `flushSync` controls React commit timing, not Core frame scheduling or terminal I/O timing.
- `flushSync` does not transfer focus or replace React state ownership; update focus state explicitly and use Core focus APIs where needed.

## Canonical sources

- [React root implementation and exports](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/renderer.ts)
- [Flush-sync example](https://github.com/anomalyco/opentui/blob/main/packages/react/examples/flush-sync.tsx)
- [Core renderer and root renderable](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderer.ts)
