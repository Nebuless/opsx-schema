# Design Journey

## Scope and Exclusions

- Scope: Plan a component-based interaction and layout redesign of the existing four-tab OpenTUI React dashboard, with Settings as the design anchor. Make staged choices, read-only review, confirmation, and observed result distinguishable at 100x32 and 60x18, including `NO_COLOR` and reduced motion.
- Exclusions: No source-code implementation or package installation in this planning pass; no change to OpenSpec lifecycle authority, switch/apply semantics, provider approval, or host destination resolution. The earlier reported Apply concern remains a separate investigation, not a claim this plan fixes it.

## Material Decisions

- The user explicitly requested a new change with planning artifacts only and asked to use GHUI as a visual reference, not a wholesale dependency. Earlier exploration established that the application already has four tabs, one keyboard owner, and OpenTUI React; the remaining gap is reusable composition and interaction hierarchy rather than another color/text pass.
- Prefer a small set of project-owned OpenTUI React presentation components and local composition over adding GHUI, termcn, or another navigation owner. Reassess an individual third-party component only after source/API and dependency review during implementation.
- Preserve existing keyboard bindings, safety gates, and read-only browser behavior; visual design must never equate a staged checkbox with an applied effect.

## Grilling Receipt

- Status: not_applicable
- Method: unavailable fallback
- Result: The user requested a scoped design proposal rather than adversarial grilling. Risks from the earlier exploration—selection scrolling, truthful no-op/partial results, narrow terminals, and duplicated keyboard ownership—inform the proposal.

## Route Selection

- Branch ID: componentized-dashboard-composition
- Selected route: Compose existing views from a small project-owned set of bounded sections, focus/selection cues, state labels, and review panels, using existing OpenTUI React/Core facilities. This directly addresses the user's component-integration request without adding a second UI runtime.
- Alternatives: Import all of GHUI (unnecessary dependencies and another interaction model); only tweak colors and prose arrays (does not solve the component gap); add a general-purpose UI kit before validating the specific workflows (premature surface area).

## Approval Receipts

- Discovery: The user asked to focus on TUI design/formatting and subsequently asked for component research; 2026-09-24.
- Route selection: The user agreed GHUI should be a reference, not a dependency, and asked for research on terminal UI applications; 2026-09-24.
- Direction selection: The user explicitly requested a new OpenSpec change with planning artifacts only; 2026-09-24. No implementation approval is implied.
- Accepted loopback: none.
- Pre-task handoff: The user requested that the planning artifacts be completed and presented before any apply workflow; 2026-09-24.

## MCP Receipt

- Approval: Not relevant; this design change does not need MCP setup.
- Host and evidence: Existing OpenTUI React application in `src/tui/`; no MCP configuration requested.
- Config target: none.
- Catalog and result: none.
- Validation and fallback: Existing local source and documentation research only.

## Loopback History

- None in this change.

## Sibling Changes

- `design-rich-terminal-dashboard`: complete; owns earlier visual and skill-host visibility contracts. This change refines composition/interaction presentation, preserves its safety requirements, and does not repeat its Apply behavior implementation.
- `improve-opsx-read-performance-and-terminal-ux`: complete; preserves its read and navigation contracts.

## Reconciliation Receipts

- Initial creation: no existing output paths in this change and no canonical spec files changed. The concrete `proposal.md`, `specs/terminal-dashboard-component-composition/spec.md`, `design.md`, `adr.md`, and `tasks.md` were read through dependency handoffs. `openspec status --change componentize-terminal-dashboard --json` reported all six artifacts done and the concrete spec path in `existingOutputPaths`; `openspec validate componentize-terminal-dashboard --type change --strict` reported valid on 2026-09-24. No loopback or sibling spec conflict required repair.
