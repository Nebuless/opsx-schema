# Deployment

**Canonical:** https://opentui.com/docs/ship/deploy/

## When to use

Use this reference when releasing a React OpenTUI app as source, bundle, executable, Node.js SEA, or SSH service.

## Imports and setup

Choose form by target constraints:

| Form | Ship | Core requirement |
| --- | --- | --- |
| Bun source | source, lockfile, production deps | matching optional native package |
| Bun bundle | bundle plus emitted assets/deps | Bun target and native package |
| Bun executable | target-specific executable and plugin sidecars | build per OS, arch, libc |
| Node ESM | bundle, Node >=26.4, assets, native package | ESM + `--experimental-ffi` |
| Node SEA | executable with extracted asset manifest | set `OTUI_ASSET_ROOT` before Core |
| SSH | one host form plus listener policy | authenticate before public bind |

Normal React imports remain public package roots/subpaths; do not deep-import source files. Release smoke checks must start from clean directory, exercise native renderer and any Tree-sitter/plugins, then verify terminal cleanup after normal exit and handled signal.

## React/Core boundary

React owns the component tree and app shutdown orchestration. Core owns native assets, renderer terminal state, and cleanup. SSH is transport, not packaging; host runtime and asset rules still apply. Runtime-loaded plugins are trusted in-process code and must be shipped as explicit sidecars with dependencies.

## Lifecycle and security pitfalls

- Call `renderer.destroy()` on every normal and handled failure/signal path. `root.unmount()` does not restore terminal state.
- Build each Bun executable for exact OS, architecture, and Linux libc; define `process.env.OPENTUI_LIBC` at build time.
- Node SEA must call `getNodeAssets()` only at build time, embed each exact `{ key, source }`, extract files before Core code, and set absolute `OTUI_ASSET_ROOT`.
- `@opentui/three` and runtime-plugin support are Bun-only; do not include them in Node SEA.
- `@opentui/ssh` defaults to open authentication and loopback. Configure authentication, persistent host key, limits, and remote clipboard policy before public binding.

## Canonical sources

- [Deploy an OpenTUI application](https://opentui.com/docs/ship/deploy/)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
- [Standalone executables](https://opentui.com/docs/reference/standalone-executables/)
- [Lifecycle and cleanup](https://opentui.com/docs/core-concepts/lifecycle/)
