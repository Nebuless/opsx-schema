# Inline text children

**Canonical:** https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/text.ts

## When to use

Use when composing styled text, links, emphasis, line breaks, or spans inside a terminal text node.

## Imports and setup

No special import. Put literal/string children and text-only intrinsics inside `<text>`:

```tsx
function App() {
  return (
    <text>
      Status: <strong fg="green">ready</strong>{"\n"}
      Visit <a href="https://opentui.com" fg="cyan">opentui.com</a>
      <br />
      <em>Press Enter</em>
    </text>
  )
}
```

Text-only intrinsic names are `span`, `b`, `strong`, `i`, `em`, `u`, `br`, and `a`. They map to Core text-node renderables and may nest within `<text>` or another text modifier. `<a>` requires `href: string`; `<br>` inserts a newline. Their `fg`, `bg`, attributes, and other options are Core text-node options.

## Lifecycle, focus, and state pitfalls

Inline child placement is enforced by the **React binding** reconciler; text rendering, attributes, links, and newline behavior are **OpenTUI Core** APIs. A string or number child outside `<text>` is invalid and throws (`Text must be created inside of a text node`). A text modifier outside a text node also throws (`Component of type "span" must be created inside of a text node`, with its actual type).

- Keep layout children (`box`, `input`, `select`, and similar) out of `<text>`.
- Use explicit `{"\n"}` or `<br />` for line breaks.
- JSX whitespace is text content; control spacing explicitly when layout matters.
- `style` on inline text uses Core text-node options, never CSS.
- Inline text has no independent focus behavior; keep focus/state on surrounding interactive components and unmount text with its parent tree.

## Canonical sources

- [React text renderables](https://github.com/anomalyco/opentui/blob/main/packages/react/src/components/text.ts)
- [React host text placement checks](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/host-config.ts)
- [React text example](https://github.com/anomalyco/opentui/blob/main/packages/react/examples/text.tsx)
- [Core text renderable exports](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/Text.ts)
