# Runtime and platform support

**Canonical:** https://opentui.com/docs/getting-started/runtime-support/

## When to use

Use this reference before choosing Bun or Node.js, cross-compiling, enabling permissions, or shipping a React app to another OS/libc.

## Imports and setup

React requires React >=19.2. Bun apps need Bun >=1.3. Node apps need Node.js >=26.4, ESM, and `--experimental-ffi`:

```sh
node --experimental-ffi app.mjs
```

Set Linux libc before any Core import. A static import runs before body code, so use process environment or a bootstrap module with dynamic import:

```ts
process.env.OPENTUI_LIBC = "musl"
const { createCliRenderer } = await import("@opentui/core")
```

## React/Core boundary

React binding entry points run on Bun and Node.js. Core loads the native Zig library on first native operation and selects an optional platform package. `@opentui/three` and runtime-plugin support are Bun-only. `@opentui/react` has no dedicated Node.js CI lane; test React apps on their actual target.

Published native targets: macOS x64/arm64, Linux x64/arm64 glibc, Linux x64/arm64 musl, and Windows x64/arm64. An available package does not prove runtime parity; test target OS, architecture, terminal, and libc.

Node permissions, when enabled, need FFI and native-library reads; Tree-sitter additionally needs worker/assets/data-path access. `OTUI_ASSET_ROOT` must be absolute and complete; set it before Core executes.

## Lifecycle and platform pitfalls

- CommonJS `require("@opentui/core")` fails because Core has an asynchronous ESM graph.
- Alpine may need `libstdc++` and `libgcc`.
- Do not omit optional native packages during install; JavaScript imports can succeed while native work later fails.
- Node SEA needs filesystem extraction of embedded assets. Bun executables can embed native assets, but target builds remain OS/architecture/libc-specific.

## Canonical sources

- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
- [React bindings](https://opentui.com/docs/bindings/react/)
- [Package entry points](https://opentui.com/docs/reference/package-entrypoints/)
- [API and symbol index](https://opentui.com/docs/reference/api-index/)
