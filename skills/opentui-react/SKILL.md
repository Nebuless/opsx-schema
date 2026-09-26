---
name: opentui-react
description: Build, test, maintain, extend, debug, and ship React terminal applications using @opentui/react and OpenTUI. Use for React OpenTUI TSX, intrinsic components, hooks, renderer lifecycle, custom renderables, keymaps, plugin slots, runtime-loaded modules, tests, platform setup, and releases.
license: MIT
compatibility: OpenTUI React requires React >=19.2. Applications run on Bun >=1.3 or Node.js >=26.4 with ESM and --experimental-ffi. Bundled scripts require Node.js >=18.
metadata:
  author: opsx-schema
  version: "1.0.0"
---

# OpenTUI React

## Scope

Use this skill for an OpenTUI terminal UI rendered by React. `@opentui/react` reconciles React nodes into OpenTUI Core renderables; it is not DOM React and does not support browser elements, CSS, or DOM events.

Use normal React state, effects, refs, and callbacks. Use documented OpenTUI JSX intrinsics, hooks, and Core APIs. Do not deep-import package source files.

Read [package-entrypoints.md](references/package-entrypoints.md) before choosing an import. It distinguishes public subpaths from source-only paths.

## Fast path

1. For a new app, read [requirements.md](references/requirements.md) then [installation.md](references/installation.md); for an existing app, run `node scripts/preflight.mjs <project-dir> --json`.
2. Read [app-bootstrap.md](references/app-bootstrap.md), [react-root.md](references/react-root.md), and [jsx-and-types.md](references/jsx-and-types.md).
3. Build layout from `<box>` and `<text>`; use component references below for specialized UI.
4. Keep `renderer.destroy()` with renderer creation. `root.unmount()` only removes React tree.
5. Add one observable test with `testRender()` when React reconciliation, effects, or input behavior can regress.
6. Run the narrow existing project check through `node scripts/run-project-check.mjs <project-dir> --check <test|typecheck|build>`.

## Hard rules

- Create exactly one `CliRenderer` owner. Always destroy it on every normal and failure shutdown path.
- `createRoot(renderer)` adopts, does not own, `renderer`. `root.unmount()` does not restore terminal state.
- JSX intrinsic names are kebab-case. `<tab-select>`, not `<tabSelect>`.
- `style` accepts component options, not browser CSS. Layout dimensions are terminal cells, not characters or pixels.
- Keep inline text elements inside `<text>` only.
- Use React `ref`s for imperative Core renderable methods such as `focus()` and `scrollTo()`.
- Keep one focus state. OpenTUI has no automatic Tab traversal.
- Use `renderer.console` for application logs; stdout can corrupt the UI under some renderer modes.
- Destroy every test renderer in `finally` or teardown.
- Runtime module support dynamically imports trusted in-process code. It is not sandboxing.

## Work routing

| Need | Read |
| --- | --- |
| Start app, installation, TSX compiler setup | [requirements.md](references/requirements.md), [installation.md](references/installation.md), [app-bootstrap.md](references/app-bootstrap.md), [jsx-and-types.md](references/jsx-and-types.md) |
| Root ownership, portals, synchronous update | [react-root.md](references/react-root.md), [lifecycle.md](references/lifecycle.md) |
| Container, text, inline styles, layout | [box.md](references/box.md), [text.md](references/text.md), [inline-text.md](references/inline-text.md), [layout.md](references/layout.md) |
| Forms, focus, mouse, selection | [input.md](references/input.md), [textarea.md](references/textarea.md), [select.md](references/select.md), [tab-select.md](references/tab-select.md), [interaction.md](references/interaction.md) |
| Rich display or media | [scrollbox.md](references/scrollbox.md), [code.md](references/code.md), [markdown.md](references/markdown.md), [diff.md](references/diff.md), [line-number.md](references/line-number.md), [ascii-font.md](references/ascii-font.md), [image.md](references/image.md), [qr-code.md](references/qr-code.md) |
| Keyboard, paste, terminal focus, resize, selection | [use-keyboard.md](references/use-keyboard.md), [use-paste.md](references/use-paste.md), [use-focus.md](references/use-focus.md), [use-blur.md](references/use-blur.md), [use-on-resize.md](references/use-on-resize.md), [use-terminal-dimensions.md](references/use-terminal-dimensions.md), [use-selection-handler.md](references/use-selection-handler.md) |
| Renderer access, timeline animation, first draw | [use-renderer.md](references/use-renderer.md), [use-timeline.md](references/use-timeline.md), [time-to-first-draw.md](references/time-to-first-draw.md), [animation.md](references/animation.md) |
| Imperative custom JSX intrinsic | [custom-components.md](references/custom-components.md), [jsx-and-types.md](references/jsx-and-types.md) |
| Command system | [react-keymap.md](references/react-keymap.md) |
| Extensible host/plugin region | [react-plugin-slots.md](references/react-plugin-slots.md), [runtime-plugin-support.md](references/runtime-plugin-support.md) |
| Framework test, native test renderer | [react-testing.md](references/react-testing.md), [testing.md](references/testing.md) |
| Slow, blank, or corrupted terminal UI | [rendering-diagnostics.md](references/rendering-diagnostics.md), [troubleshooting.md](references/troubleshooting.md) |
| Inspect React reconciliation | [react-devtools.md](references/react-devtools.md) |
| Runtime target, assets, release | [runtime-platform.md](references/runtime-platform.md), [deployment.md](references/deployment.md), [standalone-executables.md](references/standalone-executables.md) |

## JSX surface

Built-in components: `<box>`, `<text>`, `<input>`, `<textarea>`, `<select>`, `<tab-select>`, `<scrollbox>`, `<code>`, `<markdown>`, `<diff>`, `<line-number>`, `<ascii-font>`, and `<image>`.

Inline text-only components: `<span>`, `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<br>`, and `<a href>`.

`TimeToFirstDraw` is a PascalCase React component. QR needs explicit `registerQRCode()` before `<qr-code>` exists. Core-only components are not magically available in React; see [component-availability.md](references/component-availability.md).

## Public React APIs

- Root: `createRoot`, `createPortal`, `flushSync`, `Root`; [react-root.md](references/react-root.md)
- Catalogue: `baseComponents`, `componentCatalogue`, `extend`, `getComponentCatalogue`; [custom-components.md](references/custom-components.md)
- App context: `AppContext`, `useAppContext`; [app-context.md](references/app-context.md)
- Hooks: each has a dedicated reference in Work routing.
- Plugin slots: `createReactSlotRegistry`, `Slot`, `createSlot`, `ReactPlugin`; [react-plugin-slots.md](references/react-plugin-slots.md)
- Diagnostics: `TimeToFirstDraw`; [time-to-first-draw.md](references/time-to-first-draw.md)
- Testing: `testRender`; [react-testing.md](references/react-testing.md)
- Types: component props, catalogue extension, JSX; [jsx-and-types.md](references/jsx-and-types.md)
- Runtime module support: side-effect and configurable subpaths; [runtime-plugin-support.md](references/runtime-plugin-support.md)

## Core boundary

OpenTUI component props, renderer creation, layout, focus, interaction, native image support, animation scheduling, testing drivers, and deployment remain Core APIs. They are valid dependencies of a React app but are not React binding APIs. Each reference labels this boundary and links its official canonical Core documentation.

## Bundled scripts

- `node scripts/validate-skill.mjs [skill-dir] [--json] [--check-links]` — validate Agent Skills structure, reference metadata, local links, and optionally live canonical URLs.
- `node scripts/preflight.mjs [project-dir] [--json] [--strict]` — read-only React OpenTUI dependency and TypeScript configuration check.
- `node scripts/run-project-check.mjs [project-dir] --check test|typecheck|build [--json]` — run a named existing package script with detected Bun or npm. This may run project-defined build/test side effects.
- `node scripts/self-check.mjs` — run isolated fixtures through every bundled script. It creates and removes only a temporary directory.

Use `--help` before an unfamiliar script. Scripts themselves never install dependencies, modify manifests, or prompt; `run-project-check.mjs` delegates to a project-defined script, which can have its own side effects.

## Evidence standard

State exact command and observed result. Do not claim app behavior from type checking alone. For UI behavior, use a test renderer frame, controlled input/mouse sequence, or an exercised terminal session. For releases, exercise the packaged artifact on its target terminal and shutdown path.
