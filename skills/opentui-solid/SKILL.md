---
name: opentui-solid
description: Implement and debug SolidJS OpenTUI applications with signals, JSX components, input, layout, and lifecycle. Use for Solid binding tasks, not React or Core-only apps.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# OpenTUI Solid

Read the [official Solid binding](https://opentui.com/docs/bindings/solid/) and [runtime support](https://opentui.com/docs/getting-started/runtime-support/) first. The `opentui` skill includes deeper local `references/solid/` guides. Use Solid signals and reactive access patterns; don't import React hooks or assume DOM elements/CSS.

- Scaffold noninteractively with `bunx create-tui@latest -t solid my-app` when creating a new project; options precede the project name. Review generated dependencies before extending it.
- Compose only [supported components](https://opentui.com/docs/components/) and check naming/props in the binding guide. Focus and keyboard routes are application decisions, not automatic DOM traversal.
- Keep renderer lifecycle explicit; dispose effects/listeners and restore the terminal on all exits. Test frames and interactions, then run the app in a real target terminal.
- Use `@opentui/keymap/solid` only if layered commands are needed; third-party recipes require their own integration skill.

Read [package entrypoints](https://opentui.com/docs/reference/package-entrypoints/) before imports and [testing](https://opentui.com/docs/core-concepts/testing/) before claiming behavior.
