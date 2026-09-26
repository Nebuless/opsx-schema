# Installation

**Canonical:** https://opentui.com/docs/bindings/react/#installation

## When to use

Use for a new React OpenTUI application or when adding OpenTUI React support to an existing Bun project. Read [requirements.md](requirements.md) first when runtime version or target platform is unknown.

## New application

Use official React template:

```sh
bunx create-tui@latest -t react my-app
```

## Existing application

Install React binding, Core, and React together:

```sh
bun install @opentui/react @opentui/core react
```

Then configure TypeScript from [jsx-and-types.md](jsx-and-types.md), bootstrap one renderer/root from [app-bootstrap.md](app-bootstrap.md), and run `node scripts/preflight.mjs <project-dir> --json` after dependencies and `tsconfig.json` exist.

## Lifecycle and pitfalls

- Do not replace peer-compatible React with a version below `19.2.0`.
- OpenTUI native dependencies are platform-specific. A successful package install does not prove target terminal rendering; verify target runtime and terminal.
- `create-tui` and `bun install` change target project files. Do not run them in an unrelated repository; put `-t` before the project name to avoid interactive prompting.
- Do not deep-import package source files after setup. Use public imports from [package-entrypoints.md](package-entrypoints.md).

## Canonical sources

- [React installation](https://opentui.com/docs/bindings/react/#installation)
- [React requirements](https://opentui.com/docs/bindings/react/#requirements)
- [Runtime and platform support](https://opentui.com/docs/getting-started/runtime-support/)
