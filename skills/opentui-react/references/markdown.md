# Markdown

Use `<markdown>` for parsed Markdown documents, including headings, lists, tables, and fenced code. It maps to Core `MarkdownRenderable`; use `<code>` when all content is source text.

**Canonical:** https://opentui.com/docs/components/markdown/

## React binding

`<markdown>` is automatic in `@opentui/react`. Pass `content` and usually a Core `SyntaxStyle`; options include `conceal`, `concealCode`, `streaming`, `tableOptions`, `renderNode`, and `treeSitterClient`.

App bootstrap imports `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core`; component setup imports `SyntaxStyle` and `RGBA` from `@opentui/core`. No markdown registration is needed.

```tsx
import { RGBA, SyntaxStyle } from "@opentui/core"

const syntaxStyle = SyntaxStyle.fromStyles({
  "markup.heading.1": { fg: RGBA.fromHex("#58a6ff"), bold: true },
  "markup.raw": { fg: RGBA.fromHex("#a5d6ff") },
  default: { fg: RGBA.fromHex("#e6edf3") },
})

function Document({ source }: { source: string }) {
  return <markdown content={source} syntaxStyle={syntaxStyle} width={72} conceal />
}
```

`tableOptions` controls table style, width, wrapping, padding, borders, and selection. Fenced language info is normalized (`tsx` becomes `typescriptreact`, `.jsx` becomes `javascriptreact`). `renderNode` is a Core callback for custom token rendering; keep it stable with `useCallback` if it closes over state.

## Streaming hazard

Set `streaming` true while appending chunks. When the stream ends, set `streaming` to false so trailing partial blocks and table rows finalize. Do not leave a completed document in streaming mode. Core’s experimental `internalBlockMode: "top-level"` and `_stableBlockCount` are not normal React application API; avoid them unless implementing the documented scrollback integration.

## Core boundary

React `<markdown>` reconciles to Core `MarkdownRenderable`; Core-only code uses `new MarkdownRenderable(renderer, options)`, `.content`, `.streaming`, and imperative custom render callbacks. React refs may access the Core renderable, but React owns mounted lifetime and content updates. Parser/filetype mapping helpers such as `extensionToFiletype` are Core APIs imported from `@opentui/core`.

## Canonical sources

- [Markdown component docs](https://opentui.com/docs/components/markdown/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Markdown.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Markdown.ts)
