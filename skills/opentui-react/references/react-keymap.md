# React keymap integration

**Canonical:** https://opentui.com/docs/keymap/react/

## When to use

Use `@opentui/keymap/react` when commands, layers, priorities, sequences, and focus-aware bindings should be managed by OpenTUI Keymap instead of ad-hoc `useKeyboard` conditionals.

## Imports and setup

```tsx
import { createCliRenderer, type CliRenderer } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { KeymapProvider, useBindings, usePendingSequence } from "@opentui/keymap/react"
import { createRoot } from "@opentui/react"

function App({ renderer }: { renderer: CliRenderer }) {
  useBindings(() => ({
    commands: [{ name: "app.quit", run: () => renderer.destroy() }],
    bindings: [{ key: "q", cmd: "app.quit" }],
  }))
  const pending = usePendingSequence()
  return <text>{pending ? `Waiting: ${pending}` : "Press q"}</text>
}

const renderer = await createCliRenderer()
const keymap = createDefaultOpenTuiKeymap(renderer)
createRoot(renderer).render(
  <KeymapProvider keymap={keymap}>
    <App renderer={renderer} />
  </KeymapProvider>,
)
```

Public React exports: `KeymapProvider`, `useKeymap`, `useActiveKeys`, `usePendingSequence`, `useBindings`, and `reactiveMatcherFromStore`.

## Lifecycle and pitfalls

- Provider receives an existing `Keymap<Renderable, KeyEvent>`; it does not create the keymap or own renderer cleanup.
- Keep `keymap` stable for provider lifetime. `useBindings(createLayer, deps)` memoizes the layer and disposes the old layer when dependencies change or component unmounts.
- Include every prop/state value used to build a layer in `deps`. Local layers require `targetRef`; `targetMode` without `targetRef` throws.
- `useActiveKeys` and `usePendingSequence` subscribe to batched keymap state and clean up on unmount.
- This integration is for OpenTUI's `@opentui/keymap/opentui` host, not browser HTML keymaps.

## Core boundary

React provider/hooks connect React lifecycle to Keymap state. Keymap parsing, dispatch, layers, `Renderable` targets, and OpenTUI host integration are non-React APIs.

## Canonical sources

- React keymap docs: <https://opentui.com/docs/keymap/react/>
- Core keymap docs: <https://opentui.com/docs/keymap/core/>
- React example: <https://github.com/anomalyco/opentui/blob/main/packages/react/examples/keymap.tsx>
