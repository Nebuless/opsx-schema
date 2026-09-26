---
name: opentui-components
description: Select and compose official OpenTUI components and companion packages across Core, React, and Solid. Use for inputs, text, images, code/diff, layout, media, and component support questions.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# Official component chooser

Read the [official support overview](https://opentui.com/docs/components/) then the specific [component page](https://opentui.com/docs/components/box/) before selecting an API. Core renderables, React intrinsics, and Solid intrinsics are **not identical surfaces**. `opentui` has local `references/components/` by category; `opentui-react` has individual React component pages.

| Need | Start with |
| --- | --- |
| Hierarchy, layout, scrolling | Box, ScrollBox, Scrollbar; layout guide |
| Readable content | Text, ASCII font, Markdown, Code, Diff, Line Number |
| Editing and selection | Input, Textarea, Select, Tab Select, Slider |
| Media or rich cells | Image, Frame Buffer, Embedded Terminal, QR Code |
| Structured data | Text Table; inspect binding availability |
| Performance diagnostics | Time To First Draw, rendering diagnostics |

Companion packages: `@opentui/keymap` for layered commands, `@opentui/qrcode` for QR, `@opentui/ssh` for per-session SSH renderers, and `@opentui/three` for Bun-only WebGPU. Install only for a task that needs them. Check [package entrypoints](https://opentui.com/docs/reference/package-entrypoints/) and runtime requirements before importing.

For buttons, dialogs, grids, forms, command palettes, or elaborate visual recipes, first decide if a small composition suffices. If not, `opentui-tuiparts` covers Core/React/Solid behavior+recipes and `opentui-termcn` covers a larger React copy-source catalog. These are third-party libraries, never built-ins.
