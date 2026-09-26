## Why

The four-tab terminal dashboard is functional but reads as contiguous prose, particularly in Settings where selecting, previewing, confirming and reporting effects are easy to conflate. A user reported uncertainty that an OMP-target Apply actually completed. Better visual hierarchy must make the current operation and each verified outcome legible without pretending that formatting fixes the underlying mutation. OMP and Atomic also need real skill-target coverage rather than decorative checkboxes.

## Scope

- Give Overview, Changes, Archive and Settings a coherent visual system: grouped regions, purposeful spacing, compact labels, visible selection/focus, constrained color, context-specific hints and responsive layouts.
- Make Overview progress, loading and historical context scannable; make the Changes/Archive list -> detail -> file hierarchy visually explicit.
- Show Settings schema, profile, migration and skill-host choices in distinct groups; keep stage, exact-effects preview, confirmation and per-target outcomes visibly and behaviorally distinct.
- Add discoverable OMP and Atomic skill-install targets and truthful per-target preview/outcome reporting without conflating them with agent-profile selection.
- Selectively adapt compatible termcn OpenTUI visual patterns/components and bounded motion guidance, preserving the existing React OpenTUI runtime and app-owned interaction state.

## Exclusions

- No new screen authority, automated lifecycle mutations in read-only tabs, implicit migration, skill removal, unattended provider approval, or assertions of installation based only on an accepted confirmation.
- No wholesale termcn/tuiparts installation, Ink renderer, new navigation state machine, or speculative repair of the separately reported partial-Apply defect without a reproduction.
- No app-code change as part of this proposal capture; no remote MCP configuration.

## What Changes

The interface will communicate hierarchy and stage at a glance at 100x32 and 60x18. Primary action keys and statuses retain text/markers with `NO_COLOR`; frequent keyboard navigation remains immediate. Pending reads can show restrained activity, known task progress can use bounded visual progress, and reduced-motion users see static equivalents. After Settings Apply, outcomes identify applied, unchanged, blocked and recovery-needed targets individually, based on observed effects. Selecting OMP or Atomic reveals actual discovered skill destinations and operations before any write; unavailable or conflicting hosts block safely.

## Capabilities

### New Capabilities

- `terminal-dashboard-visual-design`: Visible layout hierarchy, responsive navigation, readable state/progress, and bounded accessible motion across the four-tab React OpenTUI dashboard.
- `skill-host-installation-visibility`: Select and inspect real OMP/Atomic skill-install effects distinctly from agent-profile choices; report per-target results after guarded Apply.

### Modified Capabilities

- None in canonical `openspec/specs/` yet. The completed `terminal-dashboard-usability` change is an unsynced baseline; preserve its requirements and reconcile if it becomes canonical before this change is applied or synced.

## Selected Direction

Settings anchors the visual language: distinct schema/agent/skill-host/migration groups and a stepwise stage -> preview -> confirmation -> outcome path. Overview and read-only browsers adopt the same section grammar. Impeccable guides Operate-surface hierarchy; the approved Emil Kowalski motion reference constrains frequent keyboard actions to immediate response and allows restrained occasional state feedback. termcn is a selective source of patterns, not a second renderer or owner of global keys.

## Impact

Affects `src/tui/app.tsx`, `src/tui/overview.tsx`, `src/tui/browser.tsx`, `src/tui/settings.tsx`, shared read/preview/installation models and host-resource discovery where required. Existing four-tab keyboard contracts, OpenSpec authority, ADR 0001-0003, provider approval and no-color/reduced-motion behavior remain in force. Any OMP/Atomic target behavior requires verified paths, ownership and preview parity before Apply. Completed change `improve-opsx-read-performance-and-terminal-ux` remains the behavioral baseline; no prior task is reopened.
