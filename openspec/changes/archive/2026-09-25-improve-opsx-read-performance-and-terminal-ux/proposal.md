# Intent

## Why

The standalone `opsx-schema` application already provides an agent CLI and four-tab OpenTUI dashboard, but useful project reads are slower than their loading frame suggests. In five warm-host, one-active-change trials, median CLI `status` took 1,474 ms and `changes` took 1,247 ms; the first visible dashboard loading output appeared in about 99 ms, while data-ready time was not measured. These are diagnostic samples, not cold-start or p95 targets. The OpenSpec adapter starts synchronous subprocesses, project reads obtain detailed change data before returning, and the watcher requests a full snapshot every two seconds even when nothing changed. People also need clearer selected-item context and keyboard guidance across the existing tabs. Agents need faster reads without a different answer from the human dashboard.

## Desired Outcome

A person reaches accurate project data promptly, can navigate Overview, Changes, Archive, and Settings with visible focus and context, and sees truthful readiness and task progress in loading, empty, error, narrow, no-color, and reduced-motion conditions. Inspired by `openspec view`, Overview groups an authoritative specification/requirement summary, active changes with per-change progress, and completed changes identified as history; it does not conflate schemas with specifications or planning readiness with implementation progress. An agent gets the same authoritative project state through stable compact and JSON CLI reads without unnecessary work. An unchanged idle project does not repeatedly launch full OpenSpec reads; a real edit becomes visible and missed events are still reconciled. Performance is measured before numeric service goals are selected.

## Scope Boundaries

**In scope:**
- Establish reproducible cold/warm baselines for one and ten active changes: CLI `status`, `changes`, and relevant schema reads; dashboard first visible frame and data-ready; subprocess counts; tab changes, one edit/debounce, and unchanged idle. Record p50/p95 over enough runs to compare before/after under the same conditions.
- Reduce repeated or unrelated read work while preserving OpenSpec's authority, exact schema pins and provenance, JSON/compact agreement, archive distinctions, and error behavior. Keep event-driven refresh and periodic missed-event reconciliation without full OpenSpec work on every unchanged tick.
- Refine the four-tab information hierarchy and selected-list/detail navigation using ghui as interaction inspiration. Model Overview on `openspec view` with Summary, Active Changes, and Completed Changes sections, authoritative canonical specification/requirement counts, active per-change task progress, contextual keyboard hints, and observable focus. Preserve separate planning-artifact readiness and checked implementation-task progress; animate only real changes and respect reduced motion and no-color output.
- Exercise real terminal behavior with pilotty at ordinary and narrow sizes, including read-only tab navigation, filters and file inspection, resize, loading/empty/error states, and Settings preview boundaries.

**Out of scope:**
- New TUI lifecycle-writing controls, artifact editing, archive mutation, changed schema-switch semantics, or MCP provider-approval shortcuts.
- Reimplementing or replacing OpenSpec lifecycle authority, inventing progress while loading, changing the agent CLI command grammar, or silently weakening freshness and validation to gain speed.
- Wholesale adoption of `tuiparts` or `termcn`, a ghui visual clone, and arbitrary hard millisecond SLOs before cold/warm and data-ready baselines exist.

## Approaches Considered

1. **Change-aware reads and a focused interface refinement (chosen).** Measure first, remove redundant reads or refreshes while retaining authoritative OpenSpec checks, then make selected content and key hints legible inside the existing four tabs. Lowest product and compatibility risk; improvement must be demonstrated rather than assumed from the first frame.
2. **Aggressive persistent cache or replacement lifecycle engine.** Could reduce subprocess overhead further, but creates staleness/invalidation complexity and risks diverging from OpenSpec's schema, task and archive semantics. Not justified without measured evidence that focused read work cannot meet an agreed target.
3. **Visual/component-library refresh alone.** Faster to sketch but does not address slow data-ready reads or idle subprocess churn; a peer-incompatible component dependency adds risk without proving user benefit.

## Decision Record

- The user chose **baseline first**, not a provisional 500 ms p95 commitment. Record comparable cold/warm p50/p95, data-ready time and process counts before selecting any hard latency target; show before/after results and regressions explicitly.
- Keep one shared project/domain model and delegate lifecycle truth to OpenSpec. The four current tabs, read-only Changes/Archive, guarded Settings schema Apply and separately approved MCP installation remain unchanged in authority.
- Prefer adapting ghui's compact selected-list/detail and keyboard discoverability over adopting a component library. `tuiparts` currently advertises an OpenTUI peer line based on 0.4.x while this application uses 0.5.x; any selective `termcn` source use needs local typecheck and real-terminal proof.

## Capabilities

### New Capabilities

- `project-read-responsiveness`: Comparable baseline and improvement evidence, useful CLI/dashboard reads, and change-aware idle/event/reconciliation behavior without sacrificing authoritative data.
- `terminal-dashboard-usability`: Discoverable four-tab navigation, selected-item context, truthful progress, and usable terminal states across size, color and motion conditions.

### Modified Capabilities

None. The canonical `openspec/specs/` directory has no existing capability requirements to amend; these deltas add compatible behavior while retaining the prior application change as historical context.

## Success Signals

- A reproducible report gives cold/warm p50/p95, sample counts and OpenSpec child-process counts on fixed one- and ten-change projects, plus dashboard first-frame and data-ready timings. The first frame is never substituted for data-ready. Before/after comparisons show whether improvements beat run-to-run variation; any numeric release target is chosen from this evidence, not asserted here.
- On an unchanged 30-second idle run, the dashboard does not repeatedly perform full snapshots or launch OpenSpec processes; one edited input updates visible state after debounce, and missed-event reconciliation still detects relevant changes. CLI compact and JSON views remain semantically consistent with OpenSpec.
- A pilotty session demonstrates Overview summary and active/completed sections, keyboard selection, inspect/back/filter flow, archive browsing, resize and error/empty states on the four tabs. Specification/requirement totals come from OpenSpec canonical specs, and historical entries remain distinguishable from active changes. Read-only tabs make no changes; Settings retains explicit previews and separate provider-safety approval. Progress labels remain accurate when task state is missing or unparsable.

## Prior Learning

No `docs/solutions/` learning store exists in this repository. Existing planning constraints are recorded instead in `adr/0001-cli-runtime-and-authority.md` (OpenSpec authority, one domain model, read-only tabs and guarded provider approval), `adr/0002-schema-revisions-and-provenance.md` (revision identity), and `adr/0003-schema-switch-and-validation.md` (freshness and switch gate); this proposal does not supersede them.

## Impact

Likely read seams: `src/openspec/client.ts`, `src/domain/snapshot.ts`, `src/domain/watch.ts`, CLI read projections and the four React OpenTUI views. Existing domain and TUI tests may need contract-aligned updates; pilotty adds real PTY evidence rather than substituting snapshot text for behavior. Any caching or parallel read strategy must preserve external edit detection, deterministic JSON, and no mutation outside Settings. Existing `docs/plans/plan.md` and the completed `build-opsx-schema-application` change remain untouched.

## Next Handoff

`openspec instructions specs --change "improve-opsx-read-performance-and-terminal-ux" --json`
