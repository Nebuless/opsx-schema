# Package entry points

**Canonical:** https://opentui.com/docs/reference/package-entrypoints/

## When to use

Use this reference before adding an import, configuring JSX, or sharing code between React and Core. Published entry points are supported API; source-file deep imports are not.

## Imports and setup

Typical React app imports:

```tsx
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
```

React public entry points:

- `@opentui/react` — root, catalogue, components, hooks, slots, types.
- `@opentui/react/renderer` — `createRoot`, `createPortal`, `flushSync`, `Root`; generated publish map surface, not a general root re-export.
- `@opentui/react/test-utils` — `testRender` over Core testing.
- `@opentui/react/runtime-plugin-support` and `/configure` — Bun-only runtime support.
- `@opentui/react/jsx-runtime` and `/jsx-dev-runtime` — compiler-selected paths; configure `jsxImportSource`, do not import directly.

Core paths relevant to React users: `@opentui/core`, `/testing`, `/yoga`, and (Bun-only) runtime-plugin paths. QR uses `@opentui/qrcode/react`, which includes encoder/renderable exports plus `registerQRCode()`.

## React/Core boundary

React paths expose reconciliation and React wrappers. Core paths expose renderer, renderables, terminal input, Yoga, native media, testing, and lifecycle. Core component names do not become React intrinsics unless the React catalogue supports them; use kebab-case intrinsic names and documented registration.

## Lifecycle and import pitfalls

- Do not import `@opentui/*/src/*`, platform native packages, generated internals, or guessed subpaths.
- `/renderer` is a generated publish surface; do not depend on unrelated root values through it.
- Runtime-plugin support paths are Bun-only and Node stubs throw. Dynamic runtime loading executes trusted code in-process, not sandboxed code.
- Keep `jsxImportSource: "@opentui/react"`; TypeScript selects JSX runtime paths.
- Check generated [API and symbol index] when an export or subpath is uncertain.

## Canonical sources

- [Package entry points](https://opentui.com/docs/reference/package-entrypoints/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
