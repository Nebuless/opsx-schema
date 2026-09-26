---
name: opentui-design
description: Design and refine terminal-native OpenTUI interfaces from a user brief. Use for visual direction, layouts, density, themes, focus flows, responsive terminal sizes, or a request for a beautiful TUI.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# OpenTUI design loop

Use with `opentui` for APIs and `opentui-test-and-ship` for proof. Design in terminal cells, not browser pixels. Prefer compact, information-dense panels; avoid gratuitous gaps, margins, and card chrome. Beauty here means hierarchy, legibility, intentional color, and predictable interaction—not maximum decoration.

## 1. Turn the brief into a screen contract

Write down the primary user task, must-see data, available actions, and exceptional states. Decide whether the app is a dashboard, browser, editor, form, or conversational view. Choose one dominant region and a compact secondary region; don't give every piece of information equal visual weight. Specify title, status, contextual help, and the focused element.

Use [the design brief](assets/design-brief.md) if requirements are ambiguous. Do not invent extra controls just to populate space.

## 2. Plan cells and states

- Sketch at **80×24** and **120×40** (or the user's target sizes); define minimum usable dimensions and what collapses/scrolls first.
- Use readable labels and consistent glyph semantics; provide an ASCII/low-color fallback where glyph or color support is uncertain.
- Choose contrast for active, inactive, disabled, warning, and error states. Never communicate state by color alone.
- Define initial focus, keyboard route, escape/back behavior, mouse affordances, long-text truncation, and visible shortcut hints.
- Plan loading, empty, error, success, and confirmation states. Reserve space for transient feedback without unexpected layout jumps.
- Use borders only where they clarify grouping. Keep adjacent panels contiguous unless separation carries meaning.

## 3. Choose implementation

Use built-in OpenTUI components first. For compound controls or visual recipes, inspect `opentui-components`, then opt into `opentui-tuiparts` or `opentui-termcn` only if its framework and ownership model fit. A library's visual example is inspiration, not proof of terminal compatibility.

## 4. Iterate on evidence

Render at both sizes, inspect actual terminal frames, and revise hierarchy, overflow, alignment, focus visibility, and contrast. Exercise the main path and one exceptional path with input. Typechecking alone is not a visual review. Report the sizes and observed result, not merely that the UI "looks good."

## Done when

The main task is immediately recognizable, the narrow layout remains usable, every actionable control has a keyboard route and visible state, empty/error states make sense, and rendered frames plus input/shutdown evidence support the claim.

Canonical design baseline: [OpenTUI official skill](https://github.com/anomalyco/opentui/blob/main/packages/web/src/content/SKILL.md#terminal-layout-defaults).
