# `useSelectionHandler`

**Canonical:** https://opentui.com/docs/bindings/react/#useselectionhandlerhandler

## When to use

Use `useSelectionHandler` when the app must react after terminal text selection ends, such as copying selected text into app state or showing selection metadata.

## Imports and setup

```tsx
import { useState } from "react"
import { useSelectionHandler } from "@opentui/react"

function SelectionStatus() {
  const [selected, setSelected] = useState("")

  useSelectionHandler((selection) => {
    setSelected(selection.getSelectedText())
  })

  return <text>{selected ? `Selected: ${selected}` : "Select text"}</text>
}
```

The callback receives Core `Selection`. `getSelectedText()` returns selected text in display order.

## Lifecycle and pitfalls

- The hook subscribes to renderer `selection` and removes the listener during React cleanup.
- The callback is stable internally and sees current state. Do not add a second renderer listener solely to keep callback identity stable.
- Selection is global per renderer. It is not a DOM `Selection`, and its bounds/offsets use terminal display cells, not UTF-16 indexes.
- Selection is emitted when a drag ends. Renderable focus and terminal-window focus are separate concerns.
- Text must be selectable in Core (`selectable: false` disables it). Use `renderer.clearSelection()` from Core when imperative clearing is required.

## Core boundary

The hook is React binding API. Selection gestures, `Selection`, selectable renderables, and `renderer.clearSelection()` are Core APIs.

## Canonical sources

- React hook source: <https://github.com/anomalyco/opentui/blob/main/packages/react/src/hooks/use-selection.ts>
- React docs: <https://opentui.com/docs/bindings/react/#useselectionhandlerhandler>
- Core interaction and selection: <https://opentui.com/docs/core-concepts/interaction/#text-selection>
