# QR code

**Canonical:** https://opentui.com/docs/components/qr-code/

## When to use

Use `<qr-code>` when a React app must display a scannable Model 2 QR symbol from text or a URL. Install `@opentui/qrcode` separately; QR is not part of Core or the default React catalogue.

## Imports and setup

Register once before rendering the intrinsic:

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { registerQRCode } from "@opentui/qrcode/react"

registerQRCode()
const renderer = await createCliRenderer()
createRoot(renderer).render(
  <qr-code
    content="https://opentui.com/docs"
    quietZone={4}
    scale={2}
    foregroundColor="#111827"
    backgroundColor="#ffffff"
    fallbackContent="Resize for QR"
  />,
)
```

Registration is an application setup side effect, not a React component mount. Use Core `QRCodeRenderable` from `@opentui/qrcode` when JSX is not needed. Use the encoder entry point for matrices, SVG, terminal strings, or bytes without a renderable.

## React/Core boundary

React supplies the registered `qr-code` intrinsic and props. Core's QR renderable measures the encoded symbol, preserves square module geometry with half-block cells, and paints terminal output. `quietZone` should be at least 4 modules; `fit: "contain"` may shrink to fit a constrained parent, while `fit: "none"` preserves configured scale.

## Lifecycle and scanning pitfalls

- `registerQRCode()` must run before `<qr-code>` is created; call it once at module/application setup. Duplicate registration is unnecessary.
- QR output depends on terminal font, cell aspect ratio, contrast, and camera. Test a real target terminal; valid encoding does not guarantee scan reliability.
- Higher `errorCorrectionLevel` improves resilience but can increase symbol version and size. Ensure parent has room or provide `fallbackContent`.
- Fallback text currently writes one cell per UTF-16 code unit. Use Basic Multilingual Plane one-cell characters; emoji, combining, joined, or wide graphemes can misalign.
- QR content may contain secrets or credentials. Treat it as sensitive terminal output and avoid logging it.

## Canonical sources

- [QR code component](https://opentui.com/docs/components/qr-code/)
- [QR encoder](https://opentui.com/docs/reference/qr-encoder/)
- [Package entry points](https://opentui.com/docs/reference/package-entrypoints/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
