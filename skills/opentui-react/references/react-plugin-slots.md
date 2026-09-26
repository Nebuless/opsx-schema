# React plugin slots

**Canonical:** https://opentui.com/docs/plugins/react/

## When to use

Use React slots when trusted plugins contribute `ReactNode` content to host-defined regions such as status bars. Host owns registry, context, slot types, ordering, and renderer lifecycle.

## Imports and setup

```tsx
import { createCliRenderer } from "@opentui/core"
import { createReactSlotRegistry, createRoot, Slot } from "@opentui/react"

type Slots = { statusbar: { user: string } }
const context = { appName: "demo" }
const renderer = await createCliRenderer()
const registry = createReactSlotRegistry<Slots, typeof context>(renderer, context)

const unregister = registry.register({
  id: "clock",
  slots: { statusbar: (ctx, props) => <text>{`${ctx.appName}:${props.user}`}</text> },
})

function App() {
  return <Slot registry={registry} name="statusbar" user="sam" mode="replace"><text>fallback</text></Slot>
}

createRoot(renderer).render(<App />)
```

`createSlot(registry, options?)` returns a registry-bound component. `ReactPlugin<TSlots, TContext>` types plugin contributions returning `ReactNode`.

## Lifecycle and pitfalls

- `<Slot>` subscribes to registry changes and removes that subscription on unmount. React owns returned subtree lifecycle.
- A component registering a plugin must return `registry.register(...)`'s unregister function from `useEffect` cleanup.
- `mode` is `append` (default), `replace`, or `single_winner`. `pluginFailurePlaceholder` handles contribution and subtree failures; placeholder failures are reported too.
- Registry key is intentionally one React registry per renderer. Create separate Core registries only when independent registry keys are required.
- Do not let plugin contributions call renderer destruction or mutate host-owned layout without an explicit host contract.

## Core boundary

`createReactSlotRegistry`, `Slot`, and React error boundaries are binding APIs. Registry registration, `SlotRegistry`, `PluginContext`, `PluginErrorEvent`, modes, ordering, and disposal are Core plugin APIs.

## Canonical sources

- React slot source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/plugins/slot.tsx>
- React slot docs: <https://opentui.com/docs/plugins/react/>
- Core slot model: <https://opentui.com/docs/plugins/slots/>
