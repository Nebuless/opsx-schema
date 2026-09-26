# Runtime plugin support

**Canonical:** https://opentui.com/docs/extend/runtime-plugins/

## When to use

Use runtime plugin support when a Bun OpenTUI React host must dynamically import trusted external TSX/ESM modules while preserving one host instance of React, Core, and related packages.

## Imports and setup

For default React mappings, install once before dynamic import:

```ts
import "@opentui/react/runtime-plugin-support"

const loaded: unknown = await import(pluginUrl)
```

When a module imports additional OpenTUI packages, configure before loading and do not also import the side-effect installer:

```ts
import { runtimeModules as keymap } from "@opentui/keymap/runtime-modules"
import { ensureRuntimePluginSupport } from "@opentui/react/runtime-plugin-support/configure"

ensureRuntimePluginSupport({ additional: { ...keymap } })
const loaded: unknown = await import(pluginUrl)
```

Validate the module contract before registration:

```ts
function isModule(value: unknown): value is { createPlugin: () => unknown } {
  return typeof value === "object" && value !== null && "createPlugin" in value && typeof value.createPlugin === "function"
}
if (!isModule(loaded)) throw new Error("Plugin must export createPlugin()")
```

## Lifecycle and pitfalls

- Bun-only, runtime-specific advanced API. Use exactly one installer for the host process; React installer already includes Core mappings.
- Configure the complete module map before the first external import. Repeated installation with changed keys/options throws; existing entries are not replaced.
- Export validation is application contract checking, not security. Dynamic import runs top-level module code before validation.
- Load only trusted in-process code. Runtime support provides no sandbox, signature verification, permissions, discovery, or process isolation. Use a separate process for untrusted code.
- Unregister plugin slot contributions and destroy the renderer in host cleanup paths.

## Core boundary

Runtime installer paths are framework-specific integration. Bun plugin rewriting, runtime module maps, Core singleton mapping, and trust model are runtime/Core concerns.

## Canonical sources

- React runtime entrypoint: <https://opentui.com/docs/bindings/react/#runtime-loaded-modules>
- Runtime plugin docs: <https://opentui.com/docs/extend/runtime-plugins/>
- API entrypoint index: <https://opentui.com/docs/reference/api-index/#entry-point-index>
