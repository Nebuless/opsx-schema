# Image

**Canonical:** https://opentui.com/docs/components/image/

## When to use

Use `<image>` when a React app displays PNG, JPEG, WebP, or GIF data. Use Core `NativeImage` only when decoding, inspecting, or transforming pixels before display.

## Imports and setup

`<image>` is built into the React catalogue; source may be a path, URL, `Blob`, `Response`, bytes, or `NativeImage`:

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"

const renderer = await createCliRenderer()
createRoot(renderer).render(
  <image source="./cover.webp" fit="cover" protocol="auto" style={{ width: 40, height: 15 }} />,
)
```

`fit` is `fit`, `cover`, or `fill`; `protocol` is `auto`, `kitty`, `sixel`, or `blocks`. React can update `source`, callbacks, fit, and protocol. Use `onLoad`/`onError` for observable load state; Core `loadPromise` is available through a ref when imperative waiting is required.

## React/Core boundary

React owns declarative props and ref wiring. Core owns decoding, native image lifetime, terminal protocol choice, intrinsic sizing, and image disposal. `style` is OpenTUI cell layout options, not CSS. Auto protocol prefers Kitty/Sixel when capabilities allow and otherwise uses Unicode blocks; tmux commonly resolves to blocks.

## Lifecycle, intrinsic, and security pitfalls

- Await current `loadPromise` before using an image in a Core scrollback surface. A failed replacement keeps the current image visible; stale loads are canceled and disposed.
- The renderable owns its current `NativeImage` and the image passed to `onLoad`; do not dispose, transfer, or reuse those owned values.
- Image geometry uses terminal pixel resolution when available and a 2:1 cell fallback. Set explicit dimensions for predictable layout.
- Overlapping images must share effective protocol; mixed protocols cannot alpha-compose. Check `effectiveProtocol` rather than assuming requested protocol succeeded.
- `source` can read local files or fetch URLs. Validate trusted sources and handle network errors; do not treat image loading as sandboxing.
- Kitty file transport requires compatible local POSIX terminal and temporary files; remote sessions, Windows, disabled graphics, and multiplexers fall back to raw/PNG. Temporary files can remain after forced termination such as `SIGKILL`.

## Canonical sources

- [Image](https://opentui.com/docs/components/image/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [NativeImage](https://opentui.com/docs/reference/native-image/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
