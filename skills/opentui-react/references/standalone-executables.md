# Standalone executables

**Canonical:** https://opentui.com/docs/reference/standalone-executables/

## When to use

Use this reference when compiling a React OpenTUI app into a Bun executable or Node.js single executable application (SEA).

## Imports and setup

Bun can embed Core native library, parser worker, default grammars, and Tree-sitter WASM:

```sh
bun build --compile ./app.ts --outfile app
```

For Linux, define libc at build time so the unused native branch is removed:

```ts
await Bun.build({
  entrypoints: ["./app.ts"],
  compile: { target: "bun-linux-x64-musl", outfile: "./app-linux-x64-musl" },
  define: { "process.env.OPENTUI_LIBC": JSON.stringify("musl") },
})
```

Node SEA uses Node.js >=26.4, ESM, and `--experimental-ffi`. At build time import `getNodeAssets` from `@opentui/core/node-assets`, add every `{ key, source }` to the SEA assets map unchanged, then prepend startup extraction that sets absolute `OTUI_ASSET_ROOT` before the bundled Core graph executes. Never call `getNodeAssets()` inside finished executable.

## React/Core boundary

React is ordinary bundled app code. Core's native library, worker, grammars, and WASM assets are the packaging boundary. Bun can embed known assets; unknown runtime-loaded modules remain external sidecars. Node SEA requires extracted filesystem paths because native libraries and workers cannot execute directly from embedded bytes.

## Lifecycle and security pitfalls

- Build once per OS, architecture, and Linux libc; install matching optional native packages before compiling.
- Keep SEA `mainFormat: "module"`, `useSnapshot: false`, `useCodeCache: false`, `execArgvExtension: "none"`, and `--experimental-ffi`.
- SEA extraction owns directory permissions, locking, integrity checks, cache invalidation, cleanup, and code signing. Use private writable directories and atomic publication for shared caches.
- Runtime plugins are Bun-only, trusted in-process code, and not embedded automatically. Ship plugin files and unmapped dependencies beside executable.
- Test executable on real target terminal, including renderer destruction and signal cleanup.

## Canonical sources

- [Standalone executables](https://opentui.com/docs/reference/standalone-executables/)
- [Deploy an OpenTUI application](https://opentui.com/docs/ship/deploy/)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
- [Package entry points](https://opentui.com/docs/reference/package-entrypoints/)
