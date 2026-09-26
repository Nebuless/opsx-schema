## Why

The existing dashboard has better labels and color than before, but its four views still assemble many text lines inside scrollboxes. In Settings, selection, staged review, exact-effects preview, confirmation, and observed results can look alike; an offscreen selected row can leave only a separate focus label visible. The user asked for actual component composition and interaction design, using GHUI as a reference rather than another formatting pass or a wholesale package import.

## Scope

Design a terminal-native component vocabulary and compose the existing four-tab dashboard with it. Make Settings the reference workflow, then carry the same hierarchy, focus treatment, and responsive layout into Overview, Changes, and Archive. Define visible state distinctions and concrete acceptance at 100x32 and 60x18, with color disabled and reduced motion.

## Exclusions

No OpenSpec lifecycle or Apply behavior change; no assertion that the earlier reported Apply issue is resolved; no change to host destination discovery, migration/provenance, provider approval, keyboard ownership, or non-TTY CLI behavior. Do not install GHUI, termcn, or an unreviewed component kit as a prerequisite. The current request produces planning artifacts only, not UI code.

## What Changes

- A stable shell distinguishes global navigation, current view, selected context, and available actions without duplicating the current key handler.
- Project-owned presentation components give sections, selected rows, state labels, bounded detail/review areas, and progress/pending states consistent semantics across tabs.
- Settings exposes the transition from selected choices to staged effects, exact read-only preview, separate confirmation, and observed result with labels that cannot be mistaken for one another; selected rows remain visible when moved through long lists.
- Changes and Archive show a clear list-to-detail-to-file path; Overview distinguishes planning, known completion, unknown state, and loading without inventing progress.
- At narrow dimensions, content stacks and scrolls while the active tab, selected item, current stage, and next action remain discoverable. Text and markers retain meaning with `NO_COLOR` or reduced motion.

## Capabilities

### New Capabilities

- `terminal-dashboard-component-composition`: A reusable terminal presentation vocabulary and responsive interaction hierarchy across all four dashboard views, with truthful visual state boundaries.

### Modified Capabilities

- None. The completed `design-rich-terminal-dashboard` change's visual and skill-host behaviors remain constraints; this change specifies the missing component-composition contract without weakening them.

## Selected Direction

Use existing OpenTUI React/Core primitives as the rendering substrate and GHUI/termcn as pattern references. Compose a small project-owned set of passive presentation components; preserve the application's current single navigation owner and guarded action flow. Prefer a component only where it improves repeated structure or state comprehension.

## Impact

Affects interactive terminal rendering in `src/tui/app.tsx`, `overview.tsx`, `browser.tsx`, `settings.tsx`, and presentation/theme helpers, plus their focused UI verification. No data format, network API, external installation, or persistence contract changes. The earlier completed dashboard and read-performance changes remain authoritative for safety and navigation.
