# Textarea

Use `<textarea>` for multiline editing with cursor movement and selection. It maps to Core `TextareaRenderable`; use `<input>` for one line.

**Canonical:** https://opentui.com/docs/components/textarea/

## React binding

`<textarea>` is automatic in `@opentui/react`. React-specific props are `focused`, `onSubmit?: () => void`, `onContentChange?: (event) => void`, `onCursorChange?: (event) => void`, and `onKeyDown?: (event) => void`. Core options include `width`, `height`, `initialValue`, `placeholder`, `placeholderColor`, `wrapMode`, `selectionBg`, `selectionFg`, `cursorColor`, `cursorStyle`, `selectionOccupancy`, `keyBindings`, and `keyAliasMap`.

Import `createRoot` from `@opentui/react`; import `createCliRenderer` and `TextareaRenderable` types from `@opentui/core` when bootstrap or refs need them. No textarea registration is needed.

```tsx
import type { TextareaRenderable } from "@opentui/core"
import { useRef } from "react"

function Editor() {
  const ref = useRef<TextareaRenderable>(null)
  return (
    <textarea
      ref={ref}
      width={60}
      height={8}
      initialValue="Draft"
      placeholder="Write…"
      focused
      onContentChange={() => console.log(ref.current?.plainText)}
      onSubmit={() => console.log("submit", ref.current?.plainText)}
    />
  )
}
```

`initialValue` is initial content, not a React controlled `value` prop. Read `plainText` through the ref or consume `onContentChange`; avoid resetting the editor on every render. `onCursorChange` reports movement. `onKeyDown` receives Core `KeyEvent`; use `keyBindings` for editor actions such as Ctrl+Return submit.

## Focus, selection, state pitfalls

Only the focused textarea captures editing keys. There is no automatic Tab traversal; parent owns focus and must coordinate `focused` with other controls. Use `logicalCursor`/`visualCursor` for cursor state; `cursorCharacterOffset` is not reliable after wide graphemes, line breaks, or joined emoji. Selection methods operate on buffer offsets/cells; choose `selectionOccupancy="boundary"` with a line cursor when that model is intended.

## Core boundary

React `<textarea>` reconciles to Core `TextareaRenderable`. Core-only imperative methods include `.focus()`, `.setText()`, cursor movement, selection, editing, `.undo()`, `.redo()`, and `.plainText`; invoke them through a React ref or use Core directly with `new TextareaRenderable(renderer, options)`. React owns lifecycle and must not manually destroy the ref target.

## Canonical sources

- [Textarea component docs](https://opentui.com/docs/components/textarea/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Textarea.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Textarea.ts)
- [Core edit-buffer source](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/EditBufferRenderable.ts)
