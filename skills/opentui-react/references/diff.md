# Diff

Use `<diff>` to render one file patch in unified or split view with optional syntax highlighting and line numbers. It maps to Core `DiffRenderable`; use `<code>` for unstructured source.

**Canonical:** https://opentui.com/docs/components/diff/

## React binding

`<diff>` is automatic in `@opentui/react`. Pass a unified diff string through `diff`; use `view="unified"` or `view="split"`, and optionally `filetype`, `syntaxStyle`, and `showLineNumbers`.

App bootstrap imports `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core`; component setup imports `SyntaxStyle` and `RGBA` from `@opentui/core`. No diff registration is needed.

```tsx
import { RGBA, SyntaxStyle } from "@opentui/core"

const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: RGBA.fromHex("#e6edf3") },
  keyword: { fg: RGBA.fromHex("#ff7b72"), bold: true },
})

function Patch({ patch }: { patch: string }) {
  return (
    <diff
      diff={patch}
      view="split"
      syncScroll
      filetype="typescript"
      syntaxStyle={syntaxStyle}
      showLineNumbers
      width="100%"
      height={18}
    />
  )
}
```

Exact options include `diff`, `view`, `syncScroll`, `filetype`, `fg`, `syntaxStyle`, `wrapMode`, `conceal`, `selectionBg`, `selectionFg`, `treeSitterClient`, `showLineNumbers`, line-number colors, added/removed/context backgrounds, content backgrounds, and sign colors. For multi-file input, create one `<diff>` per file patch: current Core rendering displays `patches[0]`.

## Focus and composition

Diff panes support terminal selection; use `selectionBg`/`selectionFg` for readable copy. `syncScroll` links both panes only in split view and is a no-op in unified view. Put a diff inside `<scrollbox>` only when outer content needs additional scrolling; avoid competing scroll owners.

## Core boundary

React `<diff>` reconciles to Core `DiffRenderable`. Core-only construction uses `new DiffRenderable(renderer, options)` and direct `syncScroll` assignment. React refs are the route to imperative Core methods/properties. `SyntaxStyle`, `RGBA`, and Tree-sitter clients come from `@opentui/core`, not React.

## Canonical sources

- [Diff component docs](https://opentui.com/docs/components/diff/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `Diff.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Diff.ts)
