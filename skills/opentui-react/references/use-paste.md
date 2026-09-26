# `usePaste`

**Canonical:** https://opentui.com/docs/bindings/react/#usepastehandler

## When to use

Use `usePaste` for terminal bracketed-paste events that should update React state or an input model. The hook receives Core `PasteEvent`, not a browser clipboard event.

## Imports and setup

```tsx
import { decodePasteBytes } from "@opentui/core"
import { usePaste } from "@opentui/react"
import { useState } from "react"

function PasteStatus() {
  const [value, setValue] = useState("")

  usePaste((event) => {
    setValue(decodePasteBytes(event.bytes))
  })

  return <text>{value || "Paste text"}</text>
}
```

`event.bytes` is a `Uint8Array`. Decode with the public Core `decodePasteBytes`; do not treat bytes as UTF-16 text.

## Lifecycle and pitfalls

- React binding owns subscription setup and cleanup. Unmount removes its `paste` listener from the AppContext key handler.
- The callback remains stable while seeing current props and state. Avoid manually re-registering on every render.
- Bracketed paste depends on terminal input support; this hook is not a host clipboard API and does not read the OS clipboard.
- Paste input is routed through the current Core input/focus model. Validate or limit text before inserting it into application state.

## Core boundary

`usePaste` is React binding API. `PasteEvent`, bracketed-paste parsing, and `decodePasteBytes` are Core APIs. Core reference: <https://opentui.com/docs/core-concepts/keyboard/>.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-paste.ts>
- React hook docs: <https://opentui.com/docs/bindings/react/#usepastehandler>
- Core keyboard API: <https://opentui.com/docs/core-concepts/keyboard/>
