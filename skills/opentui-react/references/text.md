# Text

Use `<text>` for labels, prose, styled terminal text, and selectable output. It maps to Core `TextRenderable`; use `<code>` for syntax-highlighted source and `<markdown>` for parsed documents.

**Canonical:** https://opentui.com/docs/components/text/

## React binding

`<text>` is automatic in `@opentui/react`. Pass `content` or text children. Inline `<span>`, `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<br>`, and `<a href>` are text-only React bindings and MUST remain inside `<text>`.

Import `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core` at app setup; `<text>` itself needs no registration or component import when using the JSX runtime.

```tsx
function Status({ ok }: { ok: boolean }) {
  return (
    <text wrapMode="word" textAlign="center" selectable>
      <strong>Build:</strong>{" "}
      <span fg={ok ? "green" : "red"}>{ok ? "ready" : "failed"}</span>
      <br />
      <a href="https://opentui.com">OpenTUI docs</a>
    </text>
  )
}
```

Use a typed ref only for Core inspection or imperative selection-related work:

```tsx
import type { TextRenderable } from "@opentui/core"
import { useRef } from "react"

const textRef = useRef<TextRenderable>(null)
return <text ref={textRef}>Output</text>
```

Exact text options include `content`, `fg`, `bg`, `attributes`, `selectable`, `wrapMode` (`"none" | "char" | "word"`), `textAlign` (`"left" | "center" | "right"`), and positioning options such as `position`, `left`, `top`, `right`, and `bottom`. `style` accepts OpenTUI options, never browser CSS. Alignment pads each wrapped line inside available width; it does not replace box alignment.

## Focus, selection, composition

Text is display content, not an input control. `selectable` defaults to true, so terminal mouse selection can copy prose; set `selectable={false}` for decorative labels or controls whose text should not be selected. Use `useSelectionHandler` for application-level selection handling.

Keep text children inline. A `<box>` cannot be mounted inside `<text>`, and a bare string should not be placed directly under a layout container. For rich output, compose one `<text>` with inline spans rather than many one-character renderables.

## Core boundary

React `<text>` reconciles to Core `TextRenderable`; imperative Core uses `new TextRenderable(renderer, { content, fg, ... })`, `text.textAlign = ...`, and Core `StyledText`/`TextAttributes`. Import `useRef` from `react` and `TextRenderable` from `@opentui/core` for a typed ref. React refs may expose the Core instance, but React state/props should drive content.

## Canonical sources

- [Text component docs](https://opentui.com/docs/components/text/)
- [Components overview: inline text](https://opentui.com/docs/components/#inline-text-elements)
- [React text implementation](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/text.ts)
- [Core `Text.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Text.ts)
