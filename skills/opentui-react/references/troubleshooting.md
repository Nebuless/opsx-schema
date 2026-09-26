# Troubleshooting

**Canonical:** https://opentui.com/docs/test-and-debug/troubleshooting/

## When to use

Use this reference for startup failures, broken terminal state, missing native assets, runtime plugins, images, or tests that never settle.

## Imports and setup

Start from visible symptom; inspect runtime and renderer state before changing code:

```ts
console.log({
  runtime: process.versions,
  platform: process.platform,
  arch: process.arch,
  libc: process.env.OPENTUI_LIBC ?? "glibc",
  assets: process.env.OTUI_ASSET_ROOT ?? "package-relative",
})
```

## React/Core boundary

React issues usually involve JSX intrinsic names, effects, refs, or reconciliation. Core owns terminal mode, native FFI, assets, input, image protocols, and renderer destruction. Runtime-plugin loading is Bun-only and dynamically imports trusted in-process code; it is not a sandbox.

## Symptom-first fixes

- **Keys do not echo after exit:** call `renderer.destroy()` on every normal and handled-signal path; `SIGKILL` cannot restore terminal state. POSIX `reset` repairs an already damaged session.
- **UI corrupted by logs:** use `renderer.console`; inspect screen, external-output, and console modes rather than writing arbitrary stdout.
- **`ERR_REQUIRE_ASYNC_MODULE`:** use ESM `import`; CommonJS `require("@opentui/core")` is unsupported.
- **Native FFI unavailable:** use Bun >=1.3 or Node.js >=26.4 with `--experimental-ffi`; with Node permissions grant FFI and native-library read access.
- **Missing native package/library:** install matching optional `@opentui/core-*` package for OS, architecture, and Linux libc. Optional dependency omission can defer failure until first native operation.
- **Missing asset / `OTUI_ASSET_ROOT` error:** set an absolute root before the first Core import and extract a complete exact-key asset set; configured roots disable package fallback.
- **Runtime-plugin says Bun-only:** use Bun and one host installer/map. Sidecars and dependencies remain trusted external files; executables do not embed unknown runtime modules.
- **Image falls back to blocks:** inspect capabilities, multiplexer, pixel resolution, `effectiveProtocol`, and `OPENTUI_IMAGE_PROTOCOL`; auto mode commonly chooses blocks in tmux.
- **Test visual-idle timeout:** inspect scheduler fields, `frameId`, `nativeFrameCount`, `cellsUpdated`; stop live rendering or advance `ManualClock` before increasing bounds.

## Lifecycle and security pitfalls

Do not expose SSH without authentication. Do not load untrusted runtime plugins: they run in-process with app privileges. Diagnostic input/output captures may contain secrets. Clean captures and temporary asset files after investigation.

## Canonical sources

- [Troubleshooting](https://opentui.com/docs/test-and-debug/troubleshooting/)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
- [Deploy an OpenTUI application](https://opentui.com/docs/ship/deploy/)
- [Rendering diagnostics](https://opentui.com/docs/test-and-debug/rendering-diagnostics/)
