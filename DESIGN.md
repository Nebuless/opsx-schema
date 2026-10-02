---
name: Opsx Change Register
description: A terminal register for current OpenSpec work and historical records.
colors:
  ground: "#101d1c"
  header: "#1b302b"
  active: "#1d3630"
  history: "#192723"
  selected: "#355247"
  text: "#dce7dc"
  muted: "#a8bdb2"
  border: "#59756b"
  pending: "#e4bd79"
  success: "#a6d4bd"
  error: "#f29f9a"
---

# Design System: Opsx Change Register

## Overview

Change-control register for maintainers assessing active OpenSpec work. Numbered active rows lead; archived records sit in a separate, quieter HISTORY section. Status and progress remain factual. This is a terminal interface, not a web page.

## Colors

Source of truth: `src/tui/theme.tsx`. Deep green-black ground, brighter green header and active panels, darker history panel. Bone text, mint borders, restrained amber pending/focus, green success, red error. `NO_COLOR` removes application palette colors without removing labels or selection markers. Installed native Markdown/code/diff primitives may retain neutral foreground/background fallbacks; this is not a zero-RGB ANSI guarantee.

## Typography

Use terminal monospace cells. Section titles in uppercase text establish hierarchy without font changes. Status, planning and task counts retain explicit labels.

## Layout

Four fixed tabs above one view and contextual keys below. Overview is one scrolling column: totals, active changes, then history. Browser list and context use two columns when wide and stack below 75 columns. At 60×18 the current view and focus remain visible.

File mode has one large reader, not a file sidebar or another tab. Its compact identity, Document/Source/Diff selection, read-only/historical status, task-first context and truncation notice stay above scrolling content. Full identity and provenance stay reachable in details. Reader m switches Document/Source; detail m keeps summary ownership. Esc preserves selected file, item and filter. Files selection is revealed after native frame layout, without overriding native scrollbar size callbacks. Settled refresh actions use the current highlighted inventory row if a retained filename vanishes; an already-open reader keeps its requested identity. Native wrapped preview leaves follow the settled viewport bounds, including after resize.

## Elevation & Depth

No shadows. Panel background, border and spacing separate layers.

## Shapes

Single-cell rectangular borders and numbered rows. Selected list row uses full-row ground plus a visible arrow; do not rely on color alone.

## Components

`ViewHeading`, `SectionPanel`, `SelectableRow` and `ReviewPanel` in `src/tui/presentation.tsx` provide passive styling; view owners keep keyboard control. Overview's three opt-in clipSafe panels contain native transparent border paint without changing the default panel behavior.

`TaskProgressView` in `src/tui/progress.tsx` is shared by Overview and browser context. Exact checked/total and remaining tasks lead; planning is independent and secondary. Unknown and zero-task reads have no track. Only exact completion fills its final cell, including intermediate frames after a completion regression. Known-count transitions last 260ms; unchanged/newly known data, historical counts, NO_COLOR and reduced motion remain static. Pending and failed context are labeled, never rendered as successful zero.

`DocumentPreview` in `src/tui/document.tsx` formats the same sanitized bounded text as Source with installed native Markdown, passive links/tasks and no remote grammar loading. Diff keeps the existing Git comparison semantics.

## Do's and Don'ts

- Do lead with exact checked tasks and remaining work, separately from planning readiness.
- Do label archived records as historical, never active.
- Don't add writes to Changes or Archive.
- Don't imply a percentage when total is unknown.
