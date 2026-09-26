# Component availability

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/index.ts

## When to use

Use when choosing JSX components or diagnosing `Unknown component type` and missing intrinsic type errors.

## React binding catalogue

`@opentui/react` registers these built-ins in `baseComponents`:

- Layout/display: `box`, `text`, `scrollbox`, `ascii-font`, `image`
- Input: `input`, `textarea`, `select`, `tab-select`
- Rich display: `code`, `markdown`, `diff`, `line-number`
- Text-only modifiers: `span`, `b`, `strong`, `i`, `em`, `u`, `br`, `a`

Use exact intrinsic spelling, including `ascii-font`, `tab-select`, and `line-number`.

```tsx
function App() {
  return (
    <box>
      <text content="Built in" />
      <text>
        <strong>bold</strong>
      </text>
    </box>
  )
}
```

Core has many renderables and plugins, but Core availability does not automatically add a React intrinsic. Register non-built-ins with `extend`; optional packages may expose a registration helper. QR code is an explicit example:

```tsx
import { registerQRCode } from "@opentui/qrcode/react"

registerQRCode()
// `qr-code` is now registered for React JSX.
```

## Lifecycle, focus, and state pitfalls

Built-in catalogue lookup and JSX intrinsic declarations are **React binding** behavior. Renderable classes and optional registration packages are **OpenTUI Core/extension** behavior.

- Importing a Core renderable class does not register its JSX name.
- `registerQRCode()` must run before `<qr-code>` is rendered; it calls React binding `extend` internally.
- A TypeScript module augmentation can make a name type-check while runtime registration is still missing.
- Text modifiers must be descendants of `<text>`; they are not general layout children.
- Catalogue registration is process-wide; register before root render and do not use registration as a focus or state mechanism.

## Canonical sources

- [Built-in catalogue](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/index.ts)
- [React JSX intrinsic declarations](https://github.com/anomalyco/opentui/blob/main/packages/react/jsx-namespace.d.ts)
- [QR code React registration](https://github.com/anomalyco/opentui/blob/main/packages/qrcode/src/react.ts)
- [Core renderable exports](https://github.com/anomalyco/opentui/blob/main/packages/core/src/index.ts)
