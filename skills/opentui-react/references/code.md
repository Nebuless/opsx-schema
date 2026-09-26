# Code

Use `<code>` for source text with Tree-sitter syntax highlighting. It maps to Core `CodeRenderable`; use `<markdown>` for documents and `<diff>` for patches.

**Canonical:** https://opentui.com/docs/components/code/

## React binding

`<code>` is automatic in `@opentui/react`. Required content options are `content`, `filetype`, and `syntaxStyle`; `style` cannot replace these non-style props. Import `SyntaxStyle` and `RGBA` from `@opentui/core`.

App bootstrap imports `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core`; component setup additionally imports `SyntaxStyle` and `RGBA` from `@opentui/core`. No code registration is needed.

```tsx
import { RGBA, SyntaxStyle } from "@opentui/core"

const syntaxStyle = SyntaxStyle.fromStyles({
  keyword: { fg: RGBA.fromHex("#ff7b72"), bold: true },
  string: { fg: RGBA.fromHex("#a5d6ff") },
  default: { fg: RGBA.fromHex("#e6edf3") },
})

function Source({ source }: { source: string }) {
  return (
    <code
      content={source}
      filetype="typescript"
      syntaxStyle={syntaxStyle}
      width="100%"
      wrapMode="none"
      selectable
    />
  )
}
```

Exact options include `content`, `filetype`, `syntaxStyle`, `streaming`, `conceal`, `drawUnstyledText`, `treeSitterClient`, inherited `fg`, `bg`, `selectable`, `selectionBg`, `selectionFg`, `wrapMode`, `textAlign`, and `tabIndicator`. Built-in grammars cover JavaScript/JSX, TypeScript/TSX, Markdown, Markdown inline, and Zig; other grammars need Tree-sitter configuration.

## Streaming and selection

For incremental content, set `streaming` true and update `content`; each highlight still processes complete current content. With `drawUnstyledText={false}`, later updates may keep the previous buffer visible until one-shot highlighting completes. Keep code selectable when terminal copy matters; set `selectable={false}` only for decorative output.

## Core boundary

React `<code>` reconciles to Core `CodeRenderable`. Core-only construction is `new CodeRenderable(renderer, options)`; imperative properties include `content`, `scrollX`, `scrollY`, `plainText`, `lineCount`, and `isHighlighting`. A React `ref` can read those values, but React props should own source state. `LineNumberRenderable` is a separate Core wrapper; compose it through JSX as `<line-number>` when needed.

## Canonical sources

- [Code component docs](https://opentui.com/docs/components/code/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Code.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Code.ts)
