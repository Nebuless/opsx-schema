# ASCIIFont

Use `<ascii-font>` for short decorative headings rendered with bundled ASCII-art fonts. It maps to Core `ASCIIFontRenderable`; use `<text>` for ordinary labels and prose.

**Canonical:** https://opentui.com/docs/components/ascii-font/

## React binding

The intrinsic name is exactly kebab-case: `<ascii-font>`. It is automatic in `@opentui/react`. Pass `text`, `font`, and `color`; `font` is one of `"tiny"`, `"block"`, `"shade"`, `"slick"`, `"huge"`, `"grid"`, or `"pallet"`.

Import `createRoot` from `@opentui/react` and `createCliRenderer` from `@opentui/core` in app bootstrap. No `register` call exists for this built-in component; JSX runtime discovers `<ascii-font>` automatically.

```tsx
function Banner({ title }: { title: string }) {
  return (
    <ascii-font
      text={title}
      font="block"
      color={["#00ffff", "#0088ff"]}
      selectable={false}
    />
  )
}
```

Exact options include `text`, `font`, `color` (`ColorInput | ColorInput[]`), `backgroundColor`, `selectable`, `selectionBg`, `selectionFg`, and standard positioning options `position`, `top`, `right`, `bottom`, and `left`. Terminal width is measured in cells; large fonts and long text can exceed a narrow viewport, so constrain or wrap the surrounding layout rather than expecting browser-style scaling.

## Focus and composition

ASCIIFont is display-only and does not provide editing or keyboard focus. Set `selectable={false}` for decorative banners so mouse selection stays useful for nearby content. Pair a visual banner with a normal `<text>` label when the title conveys necessary status; ASCII art alone is not a reliable terminal accessibility cue.

## Core boundary

React `<ascii-font>` reconciles to Core `ASCIIFontRenderable`. Core-only construction uses `new ASCIIFontRenderable(renderer, options)` and direct `.text` updates; React state/props should drive changing text. A React ref can access the Core instance for imperative updates, but React owns its lifecycle.

## Canonical sources

- [ASCIIFont component docs](https://opentui.com/docs/components/ascii-font/)
- [React component catalogue](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/index.ts)
- [React component prop types](https://github.com/anomalyco/opentui/blob/main/packages/react/src/types/components.ts)
- [Core `ASCIIFont.ts`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/ASCIIFont.ts)
