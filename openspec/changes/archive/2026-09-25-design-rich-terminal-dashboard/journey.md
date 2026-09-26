# Design Journey

## Scope and Exclusions

- Scope: Redesign the existing React OpenTUI four-tab dashboard for readable hierarchy, bounded sections, color, responsive narrow layouts, purposeful motion, and distinguishable Settings preview/Apply outcomes. Evaluate selective termcn OpenTUI registry components against the installed OpenTUI 0.5.x runtime. Make OMP and Atomic real skill-install targets with inspectable effects, while keeping schema/profile selection distinct.
- Exclusions: No implementation during proposal; no blanket component-library migration, second terminal renderer, replacement of existing OpenSpec lifecycle authority, provider-safety approval shortcut, or inference that pressing Apply proves every effect succeeded. Investigating the prior partial Apply report as a separate bug is not presumed in scope; the new UI must report partial outcomes truthfully.

## Material Decisions

- Existing four-tab keyboard interaction and read/write boundaries survive visual redesign. Source: user exploration and existing `src/tui/app.tsx`, `src/tui/settings.tsx`, ADR 0001 and ADR 0003.
- Settings is the design anchor: stage -> exact-effects review -> separate confirmation -> per-target result, with distinct staged/applied/blocked/unchanged/recovery states. Source: user exploration and earlier Settings behavior.
- OMP and Atomic are skill-install hosts, not merely labels or agent-profile names. The existing profile manifest does not enumerate either as profiles; target discovery/path and shared ownership require implementation research before any mutation. Source: exploration of `opsx-schema.json`, `src/resources/index.ts`, schema manifest and host-resource contracts.
- Select visual patterns or source from termcn, not an unreviewed bulk dependency. Registry entries may bring independent global keyboard handlers, direct stdout writes, Ink imports, animation intervals, or incompatible peer assumptions. Source: reviewed termcn OpenTUI docs/registry in exploration; installed runtime is OpenTUI 0.5.x and tuiparts React 0.0.6 advertises a 0.4.3 peer range.
- Color augments textual status and selection rather than carrying meaning by itself. At 60x18 the layout stacks with persistent navigation/context; at 100x32 it may use grouped regions. Progress with unknown denominators stays Unknown; animation is conditional on live pending/progress state and reduced-motion support. Source: user-approved exploration and existing terminal usability requirement.

## Grilling Receipt

- Status: skill_invocation_unavailable.
- Method: grill-me requested through `grilling`, which requires a Skill tool not exposed in this session; no invocation result is claimed.
- Result: Evidence-based conversational discovery from earlier exploration challenged the assumptions that prettier Settings imply Apply correctness, that OMP/Atomic are existing profile labels, and that termcn is a drop-in runtime. User confirmed the scoped proposal capture on 2026-09-24. Route fallback still requires explicit user approval.

## Route Selection

- Branch ID: `terminal-visual-01` (stable for this direction).
- Selected route: Impeccable as default Operate-surface design method, with Emil Kowalski design-engineering guidance as a motion specialist; OpenTUI React documentation and termcn registry remain implementation references. The specialist is not installed locally; its pinned `emilkowalski/skills@85e8e23/skills/emil-design-eng/SKILL.md` was inspected read-only (MIT repository). Its frequent-keyboard-action rule favors immediate list/tab navigation; reserve bounded motion for infrequent loading/status transitions. Web CSS/Framer examples are not a terminal-runtime prescription. No extra skill files will be installed under the planning-only authorization.
- Alternatives: blanket termcn migration rejected for conflicting keyboard/render ownership; tuiparts adapter deferred due to peer mismatch; no visual changes rejected because current content hierarchy is hard to scan. No sibling change requested.

## Approval Receipts

- Discovery: user accepted the visual exploration and approved the exact planning-artifact scope on 2026-09-24. This authorizes planning files, not app changes or provider configuration.
- Route selection: user chose "Add motion specialist" in the explicit design-route choice on 2026-09-24; branch `terminal-visual-01`. Pinned source inspected afterward without installing or configuring it.
- Direction selection: user approved the selective-termcn, four-tab, Settings-anchor direction for proposal capture on 2026-09-24; branch `terminal-visual-01`. The route choice adds motion critique without changing that direction.
- Accepted loopback: none proposed.
- Pre-task handoff: user explicitly approved the summarized proposal, two concrete capability specs, implementation design and ADR 0001-0003 review on 2026-09-24, after strict OpenSpec change validation passed (1/1, no issues). Branch `terminal-visual-01`; numbered tasks and grouped Backlog tickets may now be created.

## MCP Receipt

- Approval: no approval for optional remote MCP configuration; not required for this change.
- Host and evidence: OMP project resource tree is present; optional design-research MCP hosts are not part of this proposal.
- Config target: none.
- Catalog and result: none installed or configured.
- Validation and fallback: existing local source and previously inspected termcn docs/registry used as design evidence.

## Loopback History

None.

## Sibling Changes

- `improve-opsx-read-performance-and-terminal-ux` is complete and overlaps the terminal-dashboard-usability capability. Its completed behavior is a baseline, not an instruction to reopen its tasks. Before specs, compare concrete capability paths; no archive/sync conflict has been claimed.
- `build-opsx-schema-application` is complete; its authority and Settings boundaries remain in force.

## Reconciliation Receipts

- Initial OpenSpec status: schema `intent-driven-design`, change root `openspec/changes/design-rich-terminal-dashboard`, journey output `journey.md`, downstream artifacts blocked until this output exists; `existingOutputPaths` initially empty.
- Canonical `openspec/specs/` currently contains no capability specs; existing completed change deltas and current ADRs inform the new delta, not a fabricated canonical MODIFIED block.
- Refreshed after route selection: proposal, two concrete `specs/<capability>/spec.md` outputs, design and ADR manifest exist in `existingOutputPaths`; canonical `openspec/specs/` remains empty. `openspec validate design-rich-terminal-dashboard --type change --strict --json --no-interactive` passed (1/1, zero issues) before task handoff. Refresh status/instructions again for tasks and rerun validation when complete.
- After approved pre-task handoff, `tasks.md` resolved to the change root and contains twelve numbered, unchecked vertical outcomes. Group mapping: 1.1–1.3 -> OPSX-12, 2.1–2.3 -> OPSX-11, 3.1–3.3 -> OPSX-13, 4.1–4.3 -> OPSX-14; each Backlog ticket has three unchecked acceptance criteria with matching tags, and OPSX-13 depends on OPSX-12 while OPSX-14 depends on the other three. Backlog statuses remain To Do and plans are intentionally unset until execution. Refreshed OpenSpec status reports all six artifacts done and `isPlanningComplete: true`; strict change validation passed (1/1, zero issues). The completed sibling changes remain behavioral baselines; none was reopened or rewritten.
