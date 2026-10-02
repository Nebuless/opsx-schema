## Why

The Change Register now separates active work from history, but its reader still shows raw Markdown without change progress, while details show text-only progress. Rounded Overview tracks can appear fully filled before all tasks are checked. Maintainers need to read an artifact and understand remaining work without returning to another screen.

## Scope

Refine existing Overview progress and Changes/Archive detail and file-reader components within the approved Change Register design. Planning artifacts only are created by this workflow; application changes belong to a later explicit apply request.

## Exclusions

No new lifecycle engine, document editing, writable checkboxes, file-list sidebar, fifth dashboard tab, Settings redesign, dependency or registry installation, MCP setup, remote content fetching, expanded file limits, release work, or replacement visual identity. Optional provenance disclosure is not required; existing detail access remains.

## What Changes

- Make exact task counts and remaining work primary, with independently labeled planning readiness secondary and a common progress presentation across Overview, details, and reader context.
- Reserve a fully filled track for actual completion; unknown or invalid values have no bar and known zero-task results do not invent a percentage.
- Keep compact status labels and a breadcrumb above a large read-only document region. Archive continues to identify records and counts as historical.
- Provide Document / Source / Diff reader modes: readable Markdown, sanitized bounded source text, and the existing Git HEAD comparison. Non-Markdown files offer Source / Diff.
- Preserve four-tab shortcuts, scrolling and Esc return, selected item/filter, honest partial/error/empty/truncated states, 60x18 usability, NO_COLOR, and reduced-motion behavior.

## Capabilities

### New Capabilities

None. This extends established terminal dashboard behavior.

### Modified Capabilities

- `terminal-dashboard-usability`: Context-preserving file reading, explicit document/source/diff modes, independent task-first progress, and historical/unknown-data handling.
- `terminal-dashboard-visual-design`: Truthful task-first progress tracks, passive status labels, and compact reader hierarchy within the existing active/history register.

## Selected Direction

The user approved the revised upstream Impeccable shape brief after TermCN and TUI Parts catalog and source research. Adopt selected presentation patterns using existing OpenTUI rendering and keyboard ownership, not a wholesale library install. Keep task information visible while the document remains the dominant reading area.

## Impact

- Users: Project maintainers reading active artifacts and historical records in the terminal.
- Intended implementation surface: src/tui/overview.tsx, browser.tsx, model.ts, presentation.tsx and theme.tsx as needed; app.tsx only for affected reader key guidance. Use focused existing modules or a small reader/progress module when separation genuinely improves ownership.
- Verification: Existing TUI tests, added regression cases, actual pilotty TTY proof, independent Impeccable finish review, strict change validation, and bun run check.
- Documentation: Update docs/commands.md, the root changelog and shipped-design documentation only during apply when changed behavior is proved.
- No new public CLI grammar, persistence, OpenSpec subprocess contract, npm dependency, or resource-bundle change.
- Preserve the delivered unarchived tui-change-register work and its visual delta. This change adds narrower usability/progress requirements without rewriting that sibling plan.
