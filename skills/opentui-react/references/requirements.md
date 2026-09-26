# Requirements

**Canonical:** https://opentui.com/docs/bindings/react/#requirements

## When to use

Read before choosing application runtime or adding React OpenTUI dependencies. React binding requires React `>=19.2.0`; platform runtime, OS, architecture, terminal, and native renderer support remain separate constraints.

## Supported application runtimes

- Bun applications require Bun `>=1.3`.
- Node.js applications require Node.js `>=26.4`, ESM, and `--experimental-ffi`.
- Runtime-loaded modules and `@opentui/three` require Bun. React binding itself supports Bun and Node.js.

For Node.js, launch ESM entrypoint with FFI enabled:

```sh
node --experimental-ffi app.mjs
```

Check target OS, architecture, libc, terminal, and native assets before shipping. See [runtime-platform.md](runtime-platform.md) for native package loading, Linux libc selection, Node permissions, and executable constraints.

## React/Core boundary

React version compatibility belongs to `@opentui/react`. Native rendering, FFI, platform packages, terminal protocol support, and asset loading belong to OpenTUI Core/runtime.

## Canonical sources

- [React binding requirements](https://opentui.com/docs/bindings/react/#requirements)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
- [Package entry points](https://opentui.com/docs/reference/package-entrypoints/)
