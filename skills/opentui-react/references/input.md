# Input

Use `<input>` for one-line terminal editing. It maps to Core `InputRenderable`; use `<textarea>` for multiline editing.

**Canonical:** https://opentui.com/docs/components/input/

## React binding

`<input>` is automatic in `@opentui/react`. React-specific props are `focused?: boolean`, `onInput?: (value: string) => void`, `onChange?: (value: string) => void`, and `onSubmit?: (value: string) => void`. Core options include `width`, `value`, `placeholder`, `minLength`, `maxLength`, `backgroundColor`, `focusedBackgroundColor`, `textColor`, and `cursorColor`.

Import `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core` in app bootstrap. No input registration is needed.

```tsx
import { useState } from "react"

function Search() {
  const [query, setQuery] = useState("")
  return (
    <input
      width={32}
      placeholder="Search"
      value={query}
      focused
      onInput={setQuery}
      onSubmit={(value) => console.log("submit", value)}
    />
  )
}
```

For imperative focus, type the ref with Core `InputRenderable`:

```tsx
import type { InputRenderable } from "@opentui/core"
import { useRef } from "react"

const inputRef = useRef<InputRenderable>(null)
return <input ref={inputRef} focused />
```

`onInput` fires after edits and is the normal controlled-state update path. `onChange` is a commit event (blur or successful submit) and `onSubmit` fires when Enter succeeds. `minLength` and `maxLength` count UTF-16 code units, not graphemes or terminal cells.

## Focus, keyboard, security

Only focused input receives editing keys. OpenTUI has no automatic Tab traversal: keep one focus state in the parent, change it from `useKeyboard`, and set exactly one `focused` prop. Provide visible labels with sibling `<text>` or a titled `<box>`; terminal controls have no browser accessibility tree.

`<input>` has no password-masking mode. Do not use it for real secrets: typed values render as normal terminal text and may be captured by terminal selection or logs. Use a different secret-entry design outside this component.

## Core boundary

React props map to Core `InputRenderable` event listeners. Core-only code uses `new InputRenderable(renderer, options)`, `.focus()`, `.blur()`, `.submit()`, and `.value`; React code should prefer `focused`, state, and callbacks. Import `useRef` from `react` and `InputRenderable` from `@opentui/core`; use `ref` only for imperative focus/value access.

## Canonical sources

- [Input component docs](https://opentui.com/docs/components/input/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Input.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Input.ts)
