# Context

The approved proposal adds two capabilities—`project-read-responsiveness` and `terminal-dashboard-usability`—with no modified canonical capability. The new capability specs are additive; this design does not widen their scope. The proposal's existing five warm-host trials (one active change) are diagnostic only: median `status` 1,474 ms, `changes` 1,247 ms, first visible loading output about 99 ms, with no data-ready measurement. These samples do not establish a cold baseline, p95, or service-level objective.

Current read path evidence:

- `src/openspec/client.ts` runs every OpenSpec command through `execFileSync`, checks the installed CLI against 1.12.0, and bounds each process by a 30-second timeout and 8 MiB output buffer.
- `src/domain/snapshot.ts` gets the active list, then runs `status` and `instructions apply` for each active change. `detailedChanges` adds provenance and revision checks; `projectSnapshot` also reads the project default, archive index, and schema catalog. The project-wide snapshot is used for CLI `status` and the TUI's initial read. CLI `changes` uses detailed changes.
- `src/domain/watch.ts` watches the root and recursively discovered OpenSpec directories, debounces events, and periodically reconciles directory watches every two seconds. It currently emits a reconcile notification on every interval. `src/tui/app.tsx` runs a full `projectSnapshot` for both event and reconcile notifications, serializing refreshes but not suppressing unchanged refreshes.
- The four-tab React OpenTUI app already has tab shortcuts and a help panel. `src/tui/browser.tsx` provides read-only list/detail/file browsing for Changes and Archive. `src/tui/overview.tsx` distinguishes planning and task progress; `src/tui/model.ts` treats unavailable task data as Unknown. Settings owns the only TUI mutation flows.

Existing proof surfaces are `test/domain/reads.test.ts` (explicit project resolution; missing task state remains Unknown), `test/domain/watch.test.ts` (file events, reconciliation, close, and symlink refusal), `test/cli/commands.test.ts` (versioned JSON and default TOON describe the same status data), and `test/tui/read-tabs.test.tsx` (progress distinction, Changes filtering/safe file reads/diffs/back navigation, Archive history/diffs, bounded previews and safe errors). The package currently has `test` and `typecheck` scripts but no read benchmark. These tests are contract anchors, not substitutes for a real PTY run.

Repository ADRs 0001–0003 are currently marked **Proposed**. This change requires the following authority and safety constraints independently of those proposed ADRs: OpenSpec owns lifecycle truth and schema pins; the CLI and TUI share a domain model; Changes and Archive are read-only; task progress is explicit OpenSpec task-checkbox state; Settings schema Apply remains a guarded composite operation; MCP installation remains a separate, explicitly approved provider-safety action. No ADR conflict is identified, and none is amended here. `assets/schemas/compound-intent-driven/templates/design.md` is the artifact structure followed below.

## Goals / Non-Goals

**Goals:**

- Measure reproducible cold-process and warm read behavior before changing production reads, including p50/p95, sample counts, OpenSpec child-process counts, and separate dashboard first-frame and data-ready times for one- and ten-change projects.
- Reduce demonstrated serial or unrelated work while preserving OpenSpec as authority, the current CLI command grammar and versioned JSON/compact equivalence, schema-pin/provenance meaning, archive distinction, and error behavior.
- Avoid full OpenSpec reads on unchanged idle ticks while retaining event-driven updates and reconciliation for missed filesystem events.
- Make the four existing tabs easier to navigate and understand, with an `openspec view`-inspired Overview grouping Summary, Active Changes, and Completed Changes, with visible selection/focus, selected-item context, contextual key hints, and truthful loading, empty, error, resize, no-color, and reduced-motion behavior.
- Verify actual PTY interactions, including read-only navigation and Settings preview boundaries.

**Non-Goals:**

- Any new TUI lifecycle-write, artifact-edit, archive-mutation, schema-switch, or MCP approval behavior; changing the Settings write boundary; or changing provider-safety approval.
- Replacing OpenSpec or creating a parallel lifecycle engine; changing the CLI grammar or JSON envelope; silently weakening freshness, validation, or task-state semantics.
- Persistent cross-process snapshot caching, arbitrary latency SLOs before the baseline, wholesale `tuiparts`/`termcn` adoption, or a ghui clone/component-library migration.

## Decisions and Guardrails

1. **Baseline is a hard implementation gate.** First add/run a reproducible benchmark against the current implementation; do not change production read, refresh, or TUI paths until `benchmarks/read-performance/baseline.json` records the baseline and conditions. Use deterministic temporary projects generated with real OpenSpec 1.12.0 and exactly one or ten active changes. Measure CLI `status`, `changes`, and relevant `schemas` reads; count all OpenSpec invocations through a transparent PATH wrapper that delegates to the real CLI. Measure dashboard first visible frame separately from data-ready. Include an unchanged 30-second idle observation, one real input edit/debounce, and tab changes. Run at least 30 samples per CLI command, fixture size, output mode, and cold/warm condition cell; record p50, p95, sample count, Bun/OpenSpec versions, host, fixture shape, output mode, and terminal size. Define cold as a fresh process with no benchmark warm-up (do not claim OS page-cache eviction); define warm as samples after one discarded invocation on the same fixture. Use identical conditions before and after and show variation/regressions, not only a headline median. **Do not choose a numeric latency SLO until these measurements exist.**

2. **One authoritative OpenSpec client; bounded read concurrency, no speculative cache.** The observed per-change `status`/`instructions apply` calls are synchronous and independent read-only OpenSpec operations. After the baseline, make a clean asynchronous `OpenSpecClient.command/json` cutover and migrate every current caller (`src/catalog/schemas.ts`, `src/cli/index.ts`, `src/domain/cli.ts`, `src/domain/snapshot.ts`, `src/switch/index.ts`, and `src/validation/index.ts`); do not add a second async-only facade beside the synchronous one. Use a bounded pool (initial maximum four child reads) only for independent read-only calls; preserve deterministic list order and keep every mutation, migration, validation gate, and switch write sequence serialized under its existing preview/freshness/lock protocol. Coalesce the per-client OpenSpec 1.12.0 preflight so concurrent reads do not multiply version checks. Preserve argv, JSON parsing, timeout/buffer bounds, actionable error codes, and nonzero CLI failure envelopes. If the baseline shows concurrency does not improve measured reads, do not keep it merely for architectural neatness.

3. **Use request-local identity-aware reuse only.** Within one snapshot, share revision resolution/check work for changes referencing the same exact named revision/source/digest; do not cache across CLI invocations or TUI refresh generations. Preserve the OpenSpec pin as current truth and provenance as history. Never infer readiness from directory layout, task counts in `openspec list`, the project default, or a cached prior result. Missing or malformed task state remains Unknown; an OpenSpec failure remains an error, not a partially successful snapshot.

4. **Keep complete CLI reads stable; make TUI reads demand-scoped.** CLI `status` and `changes` retain their current fields, semantics, command names, schemaVersion 1 envelope, and identical underlying data in JSON and TOON. The shared domain read layer should expose canonical OpenSpec specification and requirement counts, archived-record names, and the data needed by Overview, Changes, Archive, and Settings without forcing initial Overview to resolve off-screen archive records, schema catalog details, and every selected-item detail. TUI panels load through that domain layer only; UI components do not call OpenSpec directly. Load selection/detail and file/diff content on demand, retaining the existing bounded safe file-reading behavior. An OpenSpec error cannot be hidden behind a partial projection.

5. **Reconcile changes, not timer ticks.** Retain debounced filesystem events and the periodic scan needed to add/remove safe directory watchers and recover from missed events. Reconcile a bounded, no-follow inventory of relevant OpenSpec inputs; emit `event` after a debounced relevant edit, or `reconcile` only when the periodic comparison finds a missed relevant change. Unchanged ticks emit no refresh callback and launch no OpenSpec process. Keep symlink/path/size protections, watcher cleanup, and one in-flight TUI refresh with at most one coalesced pending refresh. Establish the watcher/reconciliation baseline before declaring initial data ready so a change during startup is not silently lost. A refresh failure must be visible as an error/stale state; it must not relabel the previous snapshot as current.

6. **Refine the existing terminal interaction, not the product boundary.** Keep Overview, Changes, Archive, Settings; retain read-only Changes/Archive and the existing list/detail/file/filter/back model. Make Overview show Summary, Active Changes with per-change task progress, and Completed Changes identified as history; source specification/requirement counts from canonical OpenSpec specs rather than schemas or change-local deltas, with independent section loading/error states. Make current tab, selected record, and keyboard focus observable; show contextual hints for tab navigation, selection, filter, inspect, and back. Preserve separate planning-artifact readiness and checked implementation-task progress. Animate only a real progress transition, and honor reduced-motion/no-color settings. Loading, empty, and error messages must describe actual readiness; do not invent progress. Settings continues to require explicit preview and Apply for schema switching, with freshness and compatibility checks intact; MCP install remains separate and requires immediate explicit interactive human provider-safety approval. PTY proof must stop at Settings preview boundaries, not Apply a real project switch or install a provider.

7. **Reject broad alternatives.** A persistent cache or filesystem-derived lifecycle implementation can become stale or diverge from OpenSpec and is not justified by the current evidence. A visual-only refresh leaves the serial reads and idle process churn intact. New terminal component dependencies risk OpenTUI peer incompatibility and are unnecessary for the specified navigation; use ghui only as interaction inspiration.

**Measurement protocol for decision 1.** A cold sample launches a new CLI process or PTY session against a disposable fixture copy with no prior measured-workload invocation on that copy. A warm sample also launches a new process/session, but follows three unmeasured invocations of the identical workload on its copy. This distinguishes first-read from warmed-host behavior without claiming to flush or control the OS page cache. Record fixture-copy construction, warm-up durations separately from measured samples, host/environment, commands, output mode, and sample order; collect at least 30 measured CLI samples per command × fixture size × output mode × condition cell. Use the same generation, warm-up, and measurement procedure in the post-change comparison. PTY startups use the same cold/warm definitions and record sample counts separately from the one 30-second idle/edit observation per fixture. Record first frame and the existing core project-data-ready point for before/after comparison; after the Overview adds specification and history sections, record complete Overview readiness separately rather than claiming that unequal payloads have like-for-like latency.

## Implementation Units

Unit IDs are stable and must never be renumbered; add a new ID if later refinement splits one. Batches are dependency ordered. Path claims in the parallel batch are disjoint.

### U1. Capture the reproducible before baseline
- **Delivers:** A benchmark runner and immutable baseline report for the current read paths, fixtures, child-process counts, and terminal first-frame/data-ready behavior.
- **Batch:** A.
- **Layer:** Measurement harness and disposable OpenSpec fixtures.
- **Depends on:** None.
- **Path claim:** `scripts/measure-read-performance.ts`; `benchmarks/read-performance/baseline.json`.
- **Proof:** Run the harness against real OpenSpec 1.12.0 for one and ten active changes, with the cold-process/warm definitions above; report p50/p95 and sample counts for CLI and dashboard reads plus OpenSpec child-process counts. Record the initial PTY conditions and 30-second idle/edit observations. The report must distinguish first-frame from data-ready and must not label five old warm samples as a baseline.
- **Continuation:** U2/U3 may start only after the baseline report and conditions are saved. If fixture generation or instrumentation alters the read path, fix the harness before proceeding.

### U2. Make authoritative read aggregation efficient and contract-stable
- **Delivers:** A single asynchronous OpenSpec client contract; bounded concurrency for independent read-only operations; request-local reuse for identical revision checks; complete CLI and demand-scoped domain projections including canonical specification/requirement counts and archived names for Overview, with unchanged authoritative semantics.
- **Batch:** B (parallel with U3; file claims are disjoint).
- **Layer:** OpenSpec process boundary, shared domain reads, and CLI projection.
- **Depends on:** U1.
- **Path claim:** `src/openspec/client.ts`; `src/catalog/schemas.ts`; `src/domain/snapshot.ts`; `src/domain/cli.ts`; `src/cli/index.ts`; `src/switch/index.ts`; `src/validation/index.ts`; relevant existing tests in `test/domain/reads.test.ts`, `test/cli/commands.test.ts`, `test/cli/lifecycle.test.ts`, `test/resources/resources.test.ts`, `test/switch/transactions.test.ts`, and `test/validation/validation.test.ts`.
- **Proof:** Existing contract tests still establish status JSON/TOON equivalence, explicit OpenSpec project/schema facts, canonical specification/requirement counts (not schema or change-delta counts), safe archived names, Unknown task state, and guarded lifecycle behavior. Against the U1 fixture, compare one- and ten-change status/changes/schema latency and child-process counts; record any regression and verify OpenSpec errors/version mismatch still fail with the existing structured semantics.
- **Continuation:** Continue only with behaviorally equivalent authoritative data and a measured result. Keep only demonstrated reuse/concurrency; a speed claim requires before/after distributions that are distinguishable from run-to-run variation.

### U3. Stop unchanged reconciliation from refreshing the project
- **Delivers:** Relevant filesystem edits and missed-event reconciliation trigger refresh notifications; unchanged idle ticks do not.
- **Batch:** B (parallel with U2; file claims are disjoint).
- **Layer:** Filesystem watch and invalidation.
- **Depends on:** U1.
- **Path claim:** `src/domain/watch.ts`; `test/domain/watch.test.ts`.
- **Proof:** The watch test observes a real edit event, a missed-change reconciliation path, unchanged ticks with no notification, closure with no later notifications, and symlink refusal. The same project input signature is used for debounce and periodic reconciliation so ordinary edits are not dropped or repeatedly reported.
- **Continuation:** U4 may wire the unchanged `event`/`reconcile` reasons only after the targeted watch tests pass and a 30-second unchanged interval produces no refresh notifications.

### U4. Make the four-tab TUI responsive and self-explanatory
- **Delivers:** Demand-scoped panel reads, the Overview Summary/Active Changes/Completed Changes hierarchy with authoritative counts, visible selected/focus context and keyboard guidance, and truthful loading/empty/error/progress behavior across the existing four tabs and terminal conditions.
- **Batch:** C.
- **Layer:** React OpenTUI view and navigation.
- **Depends on:** U2 and U3.
- **Path claim:** `src/tui/app.tsx`; `src/tui/browser.tsx`; `src/tui/overview.tsx`; `src/tui/model.ts`; `src/tui/settings.tsx`; `test/tui/read-tabs.test.tsx`.
- **Proof:** Targeted TUI tests cover progress/Unknown, list-detail-filter-back, archive/history distinction, bounded safe previews, and observable focus/context. Run the actual application through pilotty at ordinary 100×32 and narrow 60×18 sizes with no-color and reduced-motion conditions; exercise Overview summary counts/active progress/completed history, tab changes, selection, filtering, file inspection, back, resize, loading/empty/error states, and the read-only Settings preview boundary. A temporary-project schema preview may be inspected, but do not Apply a real switch or approve/install an MCP provider as part of this proof.
- **Continuation:** U5 may collect the final comparison only after TUI tests and PTY behavior pass, including clear separate planning readiness and checked-task progress and a visible explanation when task status is Unknown.

### U5. Publish the before/after evidence and close the acceptance loop
- **Delivers:** A comparable report showing whether the complete change improves reads and idle behavior, alongside any remaining regressions and the actual terminal evidence.
- **Batch:** D.
- **Layer:** Integrated verification and performance evidence.
- **Depends on:** U1, U2, U3, and U4.
- **Path claim:** `benchmarks/read-performance/comparison.json`.
- **Proof:** Re-run the U1 harness unchanged against the same fixtures and environment. Report before/after p50/p95, counts, first-frame versus data-ready, and OpenSpec child-process counts; exercise one edit/debounce and confirm reconciliation still finds a missed change. An unchanged 30-second PTY idle run must produce no repeated full snapshot/OpenSpec process activity. Attach the pilotty observations for both sizes and Settings boundaries. State clearly when an apparent difference is within run-to-run variation.
- **Continuation:** Complete only with accurate OpenSpec-backed data, intact approval boundaries, passing targeted checks, and honest measured results. No hard latency SLO is selected in this artifact; any later target must be chosen from this evidence.

## Verification Strategy

- Use behavior-level tests on the existing files listed above; keep assertions on consumer-visible snapshot fields, errors, state transitions, and focus/navigation rather than internal forwarding or incidental render strings. Add a permanent test only for a meaningful edge contract such as missed-event recovery or same-size content change reconciliation.
- Targeted checks for implementation are `bun test test/domain/reads.test.ts test/domain/watch.test.ts test/cli/commands.test.ts test/cli/lifecycle.test.ts test/resources/resources.test.ts test/switch/transactions.test.ts test/validation/validation.test.ts test/tui/read-tabs.test.tsx` and `bun run typecheck`; project-wide validation belongs after all change artifacts and implementation slices land.
- Run CLI measurements in both `--json` and default TOON mode; compare decoded semantic data and verify failures remain nonzero structured envelopes. Do not use a mock OpenSpec binary as the sole performance or authority proof.
- Launch the actual Bun/React dashboard under pilotty and observe terminal output/input at ordinary and narrow sizes. Snapshot-render tests alone do not prove PTY layout, focus, resize, no-color, reduced-motion, or real data-ready timing.
- After all change artifacts are assembled, run the repository's documented strict OpenSpec validation command. Do not interpret that as authorization to execute Settings mutations.

## Risks / Trade-offs

- Async OpenSpec execution and bounded fan-out touch lifecycle callers as well as reads. Keep writes sequential, preserve the existing preview/freshness/lock ordering, and avoid partial JSON output. If equivalent results or an observable read win cannot be demonstrated, remove unproven concurrency rather than weaken safety.
- Parallel OpenSpec reads can observe an external edit during a snapshot. Keep the TUI's in-flight/pending invalidation behavior; surface failed refreshes and do not represent mixed/failed data as fresh. No cross-refresh cache is permitted.
- Periodic fingerprints can add filesystem cost or miss changes if they cover only directory names. Reconcile relevant file identities/content, keep the inventory bounded and safe, and exercise the missed-event path; measure the idle case as well as OpenSpec subprocess count.
- Lazy panel reads trade eager availability for lower initial work. Show a real per-panel loading/error state and preserve selection when returning to a tab; never fabricate data-ready progress.
- PTY measurements vary by host and terminal. Persist environment and sample counts, compare only like conditions, and leave the numeric SLO unset until the baseline supports a deliberate choice.
- Avoid new UI dependencies. The app targets OpenTUI 0.5.x; `tuiparts`' advertised 0.4.x peer line is not a compatible default, and any selective `termcn` source use would need separate typecheck and real-terminal proof.

## Open Questions

- **Unresolved by design, not a blocker:** What numeric latency target (if any) is warranted? Decide only after U1 produces comparable cold-process/warm distributions; this design makes no millisecond SLO commitment.
- **Measurement caveat:** Cold means a fresh process without benchmark warm-up, not an operating-system cache flush. If a true page-cache-cold target is later required, it needs a controlled runner and separate approval; it is not required to compare this change.
- No conflict with ADR 0001–0003 is identified. Their proposed status is not changed by this design.

## Next Handoff

`openspec instructions adr --change "improve-opsx-read-performance-and-terminal-ux" --json`
