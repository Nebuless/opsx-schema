---
name: opentui-core
description: Implement imperative OpenTUI Core renderers, renderables, events, layout, and lifecycle. Use when building without React or Solid, extending native renderables, or debugging renderer behavior.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# OpenTUI Core

Start with [official renderer](https://opentui.com/docs/core-concepts/renderer/) and [renderables](https://opentui.com/docs/core-concepts/renderables/); use the `opentui` skill's `references/core/` for detailed local examples. Read [runtime support](https://opentui.com/docs/getting-started/runtime-support/) before choosing Bun or Node. Native Node renderer support has additional ESM/FFI requirements; do not infer support from an import succeeding.

1. Create one renderer owner and destroy it on normal and failure paths; never use `process.exit()` as terminal cleanup.
2. Compose renderables under `renderer.root`, use Yoga [layout](https://opentui.com/docs/core-concepts/layout/) in cells, and route [keyboard](https://opentui.com/docs/core-concepts/keyboard/) and focus intentionally.
3. For a specialized component, consult the [official component overview](https://opentui.com/docs/components/) before constructing a custom renderable. Check [public entrypoints](https://opentui.com/docs/reference/package-entrypoints/) and [API index](https://opentui.com/docs/reference/api-index/) rather than deep-importing source.
4. Use [test renderer](https://opentui.com/docs/core-concepts/testing/) for deterministic frames and input, followed by an exercised terminal session for the target capability.

For images, embedded terminal, audio, SSH, 3D, and post-processing, load the corresponding canonical page before coding; support varies by binding and runtime. See `opentui-components` for the capability boundary.
