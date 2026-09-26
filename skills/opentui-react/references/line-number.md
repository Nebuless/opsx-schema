# Line number gutter

Use `<line-number>` to add a line-number gutter, signs, and per-line colors around a line-aware child such as `<code>`. It maps to Core `LineNumberRenderable`; `<diff>` owns its own gutters and should not be wrapped for ordinary diff display.

**Canonical:** https://opentui.com/docs/components/line-number/

## React binding

`<line-number>` is automatic in `@opentui/react` and accepts children. The target child supplies line information; compose `<code>` inside it. Options include `fg`, `bg`, `minWidth`, `paddingRight`, `lineNumberOffset`, `hideLineNumbers`, `lineNumbers`, and `showLineNumbers`.

Import `createRoot` from `@opentui/react`; import `createCliRenderer`, `RGBA`, and `SyntaxStyle` from `@opentui/core` in app setup. No line-number registration is needed.

```tsx
import { RGBA, SyntaxStyle } from "@opentui/core"

const syntaxStyle = SyntaxStyle.fromStyles({ default: { fg: RGBA.fromHex("#e6edf3") } })

function Source({ content }: { content: string }) {
  return (
    <line-number minWidth={3} paddingRight={1} fg="#6b7280" bg="#161b22" showLineNumbers>
      <code content={content} filetype="typescript" syntaxStyle={syntaxStyle} width="100%" />
    </line-number>
  )
}
```

The React prop type includes `children`, but line decorations are imperative Core methods: `setLineColor`, `clearLineColor`, `setLineSign`, `clearLineSign`, `setLineNumbers`, and `setHideLineNumbers`. Use a ref to call them after mount; line numbers are 1-based in documented examples. `showLineNumbers` is a property, not a child.

## Lifecycle and state

Keep the target renderable stable while applying decorations. If source content changes, line positions can change; recompute signs/colors in an effect keyed by content/version and clear stale decorations. Do not assume `showLineNumbers` constructor behavior in Core; set the property through a ref when initial visibility must be guaranteed. For selection and scrolling, compose with `<scrollbox>` around the gutter.

## Core boundary

React `<line-number>` reconciles to Core `LineNumberRenderable`; Core requires a `target` renderable and uses `new LineNumberRenderable(renderer, { target, ... })`. React composition supplies the target child declaratively; direct target wiring, `setLineColor`, and signs are Core imperative APIs accessed through `ref`.

## Canonical sources

- [Line number gutter docs](https://opentui.com/docs/components/line-number/)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `LineNumberRenderable.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/LineNumberRenderable.ts)
