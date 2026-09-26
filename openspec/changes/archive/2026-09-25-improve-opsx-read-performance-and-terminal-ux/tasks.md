# Execution and reconciliation contract

This change has five implementation units. Each numbered OpenSpec checkbox maps **one-to-one** to the numbered acceptance criterion in its named Backlog group ticket. OpenSpec and Backlog keep **independent completion states**: neither checkbox is automatically checked because the other is checked. A worker records the actual command, fixture, result, and changed paths in the group's Backlog implementation notes, verifies the observable behavior described on **both** sides, then checks each side separately. If the states or evidence disagree, leave the group open, investigate the discrepancy, and record the resolution; do not copy a checkmark as evidence. Before marking a group Done, compare every OpenSpec checkbox with its corresponding Backlog AC and task-specific DoD. OPSX-5 is the separate proposal-review gate; it does not stand in for implementation evidence. Keep IDs stable and append new IDs rather than renumbering completed work.

## 1. Establish a comparable read baseline — OPSX-6

The existing application read paths remain unchanged until **both** baseline checks are proven. OPSX-6 depends on proposal review OPSX-5.

- [x] 1.1 [U1] Save a reproducible CLI read baseline for one- and ten-change projects.
  - Batch: A. Prerequisite: OPSX-5 review complete. Backlog: OPSX-6 AC 1.
  - Layer: Measurement harness with disposable real OpenSpec 1.12.0 projects.
  - Path claim: `scripts/measure-read-performance.ts`; `benchmarks/read-performance/baseline.json`.
  - Proof: Generate disposable fixture copies containing exactly one and ten active changes with the real CLI; run unchanged production status, changes, and relevant schema reads in JSON and compact modes. A cold sample starts a fresh process with no workload warm-up on its copy; a warm sample starts a fresh process after three unmeasured repetitions on its copy. Do not claim an OS cache flush. Save fixture generation, sample order, environment/commands, separate warm-up cost, at least 30 measured samples per command × fixture size × output mode × condition cell, p50/p95, variation, and OpenSpec child-process counts from a transparent delegate wrapper. Distinguish these measurements from the prior five diagnostic warm trials.
  - Continuation: Do not start read-path edits. Keep fixture construction and wrapper behavior documented so the same run can be repeated after implementation.

- [x] 1.2 [U1] Save an actual-terminal startup and refresh baseline separately from the CLI baseline.
  - Batch: A. Prerequisite: 1.1. Backlog: OPSX-6 AC 2.
  - Layer: Terminal measurement on the same disposable one- and ten-change fixtures.
  - Path claim: `scripts/measure-read-performance.ts`; `benchmarks/read-performance/baseline.json`.
  - Proof: Launch the unchanged Bun/OpenTUI application in a new PTY session per cold or warm sample using the 1.1 fixture-copy/warm-up protocol; record first visible loading frame and the later usable core project-data-ready point as different timestamps, sample counts and conditions for both fixture sizes, tab-switch response, a 30-second unchanged idle interval, and one real edit/debounce. Capture refresh and OpenSpec child-process counts; report missing baseline observables as missing, not zero. Record new post-change Overview-section readiness separately because the current screen has no authoritative specification summary.
  - Continuation: U2 and U3 may begin only when both 1.1 and 1.2 have reproducible evidence in the saved baseline. Do not choose a hard latency target from it prematurely.

## 2. Make authoritative reads responsive — OPSX-7

OPSX-7 depends on OPSX-6. Read-only concurrency must not change mutation, migration, validation, or Settings safety ordering.

- [x] 2.1 [U2] Make the sole OpenSpec process boundary asynchronous without changing command outcomes.
  - Batch: B; may run alongside U3 after U1. Backlog: OPSX-7 AC 1.
  - Layer: OpenSpec process contract and all current callers.
  - Path claim: `src/openspec/client.ts`; `src/catalog/schemas.ts`; `src/domain/snapshot.ts`; `src/domain/cli.ts`; `src/cli/index.ts`; `src/switch/index.ts`; `src/validation/index.ts`; affected existing tests in `test/domain/reads.test.ts`, `test/cli/commands.test.ts`, `test/cli/lifecycle.test.ts`, `test/resources/resources.test.ts`, `test/switch/transactions.test.ts`, and `test/validation/validation.test.ts`.
  - Proof: Exercise successful and failing real CLI reads plus lifecycle/switch/validation checks. Verify existing version, timeout, buffer, exit and structured-error behavior, JSON/compact meaning, freshness checks and serialized guarded writes after **every** caller migrates. No second async adapter or sync compatibility path remains.
  - Continuation: A partially migrated client is not done; keep all consumers on the single contract before 2.2–2.4.

- [x] 2.2 [U2] Bound and order independent per-change OpenSpec reads.
  - Batch: B. Prerequisite: 2.1. Backlog: OPSX-7 AC 2.
  - Layer: Authoritative active-change aggregation.
  - Path claim: `src/domain/snapshot.ts`; `test/domain/reads.test.ts`; `test/cli/commands.test.ts`.
  - Proof: On one- and ten-change fixtures, show no more than four independent read-only child commands active at once, stable change order and complete OpenSpec-backed status/apply facts; compare latency and child-process counts with U1. A child failure yields the existing error outcome rather than a success-shaped partial snapshot.
  - Continuation: Keep mutations and validation gates sequential. If bounded concurrency is not distinguishably beneficial or changes results, remove it rather than weakening correctness.

- [x] 2.3 [U2] Share only identical revision checks within one read request.
  - Batch: B. Prerequisite: 2.1. Backlog: OPSX-7 AC 3.
  - Layer: Revision provenance and request-local work sharing.
  - Path claim: `src/domain/snapshot.ts`; `src/catalog/schemas.ts`; `test/domain/reads.test.ts`.
  - Proof: Changes sharing the same exact named revision/source/digest reuse the same request's check; a subsequent CLI request or TUI refresh sees changed OpenSpec state afresh. Verify pins remain current truth, provenance remains historical, archive distinction remains, missing/malformed task state stays Unknown, and OpenSpec errors fail. Report observed process/latency effect against U1.
  - Continuation: No cross-request or cross-refresh snapshot cache; do not use the project default or directory layout as a substitute for OpenSpec task/revision data.

- [x] 2.4 [U2] Expose demand-scoped domain reads while preserving complete CLI projections.
  - Batch: B. Prerequisites: 2.1–2.3. Backlog: OPSX-7 AC 4.
  - Layer: Shared domain model and read-side CLI projection, not UI-local OpenSpec calls.
  - Path claim: `src/domain/snapshot.ts`; `src/domain/cli.ts`; `src/cli/index.ts`; `test/domain/reads.test.ts`; `test/cli/commands.test.ts`.
  - Proof: A tab read can obtain its required data without resolving off-screen archive/schema/detail content. Overview receives canonical OpenSpec specification/requirement counts and the safe archived-name index through the shared domain layer, with independent section loading/error state rather than eagerly reading archived details; schemas and change-local deltas are not counted as canonical specs. CLI status and changes still return all existing fields in schemaVersion 1 and semantically equivalent JSON/TOON results. On-demand failures are surfaced as errors; external edits become visible on subsequent requests.
  - Continuation: U4 may consume these reads only after complete CLI output and error semantics remain verified.

## 3. Refresh on changed inputs, not elapsed time — OPSX-8

OPSX-8 depends on OPSX-6 and can be worked in parallel with OPSX-7. Only this group owns the watcher paths in Batch B.

- [x] 3.1 [U3] Coalesce real relevant edits and suppress unchanged idle notifications.
  - Batch: B. Backlog: OPSX-8 AC 1.
  - Layer: Filesystem event debounce and refresh invalidation.
  - Path claim: `src/domain/watch.ts`; `test/domain/watch.test.ts`.
  - Proof: A real burst of relevant OpenSpec input edits yields one coherent debounced refresh notification; an unchanged 30-second observation yields no notification or full OpenSpec snapshot solely from two-second reconciliation ticks. Irrelevant events and an already-consumed edit do not cause repeated notifications. In the running dashboard the unchanged project remains available, with idle activity distinguishable from an actual refresh.
  - Continuation: Preserve the existing event reason contract and safe watcher lifecycle; do not mistake a quiet timer for lost-edit correctness.

- [x] 3.2 [U3] Recover a missed relevant edit without following unsafe paths.
  - Batch: B. Prerequisite: 3.1. Backlog: OPSX-8 AC 2.
  - Layer: Periodic input inventory and missed-event reconciliation.
  - Path claim: `src/domain/watch.ts`; `test/domain/watch.test.ts`.
  - Proof: Suppress a notification for a changed relevant file (including a same-size content change) and for a newly created relevant path; the next safe bounded reconciliation notices each once and refreshes authoritative data. Confirm symlink refusal, watcher addition/removal, close with no later callbacks, and no repeated unchanged notifications.
  - Continuation: U4 may wire event/reconcile refresh only when both positive recovery and 30-second idle silence hold; establish the inventory before declaring initial data ready.

## 4. Make the four-tab terminal view usable — OPSX-9

OPSX-9 depends on **both** OPSX-7 and OPSX-8. Overview, Changes and Archive remain read-only; Settings retains guarded schema Apply and separate provider approval.

- [x] 4.1 [U4] Show four-tab navigation, focus, keyboard help and honest initial loading.
  - Batch: C. Backlog: OPSX-9 AC 1.
  - Layer: React OpenTUI shell and navigation.
  - Path claim: `src/tui/app.tsx`; `src/tui/browser.tsx`; `test/tui/read-tabs.test.tsx`.
  - Proof: In the actual app, Tab/Shift+Tab, number keys 1–4 and ? work; active tab, current selection and available mode-specific actions are identified without color. The first frame shows loading, not an empty or data-ready project, and an off-screen panel does not force its detail read.
  - Continuation: Preserve single in-flight refresh plus one coalesced pending refresh when watcher invalidations occur during startup.

- [x] 4.2 [U4] Separate Overview planning and checked-task progress from read readiness.
  - Batch: C. Prerequisite: 4.1. Backlog: OPSX-9 AC 2.
  - Layer: Overview data presentation and progress model.
  - Path claim: `src/tui/app.tsx`; `src/tui/overview.tsx`; `src/tui/model.ts`; `test/tui/read-tabs.test.tsx`.
  - Proof: Overview groups Summary, Active Changes and Completed Changes as in the supplied `openspec view` example while retaining four tabs. Summary shows authoritative canonical OpenSpec specification/requirement counts, active and completed counts, and aggregate checked-task progress when known; each active row shows its checked-task fraction and archived rows are explicitly historical. A section's pending, loaded-empty and failed reads remain distinct; complete Overview readiness waits for required sections, while core project-data-ready is measured separately. Planning readiness uses artifact counts and implementation progress uses explicit checked OpenSpec task counts. Missing/invalid values display Unknown, not inferred zero/full completion. A changed known value may animate when allowed; unchanged or Unknown values do not imply progress.
  - Continuation: Do not call the project data-ready until the facts shown as ready have actually loaded.

- [x] 4.3 [U4] Browse and filter active changes without mutation.
  - Batch: C. Prerequisite: 4.1. Backlog: OPSX-9 AC 3.
  - Layer: Changes list/detail/file read view.
  - Path claim: `src/tui/browser.tsx`; `src/tui/app.tsx`; `test/tui/read-tabs.test.tsx`.
  - Proof: Select with arrows or j/k; / starts visible incremental name filtering, Enter commits that filter, and Esc cancels or clears it. Enter opens the selected detail/file, d toggles content and available Git comparison, and Esc returns one view level preserving item/filter. Active detail shows available identity, status/schema, provenance, separate planning-readiness and checked-task progress, and retained-file list. Explicit empty, no-match and safe read-error states differ; previews remain bounded and no lifecycle/artifact/archive write action appears.
  - Continuation: An absent Git comparison is explained; never mask file-read failures as an empty file.

- [x] 4.4 [U4] Browse historical archive records without presenting them as active.
  - Batch: C. Prerequisite: 4.1. Backlog: OPSX-9 AC 4.
  - Layer: Archive list/detail/file read view.
  - Path claim: `src/tui/browser.tsx`; `src/tui/app.tsx`; `test/tui/read-tabs.test.tsx`.
  - Proof: The Archive tab identifies history; / starts visible incremental name filtering, Enter commits it, and Esc cancels or clears it. Selection/detail/file/diff/back preserve item and filter; detail shows available identity, status/schema, provenance, progress information and retained-file list. Bounded previews distinguish no records, no filter matches and read errors. No restore, archive mutation or lifecycle write control appears.
  - Continuation: Keep archived identity/provenance distinct from active change state.

- [x] 4.5 [U4] Preserve Settings preview, Apply and provider-approval separation.
  - Batch: C. Prerequisite: 4.1. Backlog: OPSX-9 AC 5.
  - Layer: Settings presentation over the existing guarded operations.
  - Path claim: `src/tui/settings.tsx`; `src/tui/app.tsx`; `test/tui/read-tabs.test.tsx`.
  - Proof: Stage schema/profile/migration selections without writes; preview exact targets and effects before a separate Apply confirmation. Cancellation or stale preview makes no change. MCP preview exposes provider, URL, host/target, auth/permissions and diff; denial, cancellation or changed target installs nothing. Verify denial/cancel paths in temporary fixtures; do **not** approve or install a live provider as part of this task.
  - Continuation: UI readability work cannot bypass freshness, compatibility, schema install, or the distinct interactive provider-safety check.

- [x] 4.6 [U4] Keep all four tabs usable at ordinary and narrow terminal sizes without color or motion.
  - Batch: C. Prerequisites: 4.1–4.5. Backlog: OPSX-9 AC 6.
  - Layer: Terminal layout and accessibility behavior.
  - Path claim: `src/tui/app.tsx`; `src/tui/browser.tsx`; `src/tui/overview.tsx`; `src/tui/settings.tsx`; `test/tui/read-tabs.test.tsx`.
  - Proof: Launch real PTY sessions at 100×32 and 60×18; verify Summary, Active Changes and Completed Changes remain readable or reachable, switch tabs, filter/select/inspect/back, resize while keeping names, essential status/detail, selection and primary hints readable or reachable by wrapping/scrolling, and stage a non-writing Settings preview. Under no-color conditions, text/markers still convey selection, status, progress, loading and error; under reduced motion, progress stays static. Run targeted UI checks and `bun run typecheck`.
  - Continuation: Do not replace PTY evidence with snapshot-only assertions or add incompatible terminal component dependencies by assumption.

## 5. Compare and verify the integrated result — OPSX-10

OPSX-10 depends on OPSX-9; its report is a comparison, not a new performance target.

- [x] 5.1 [U5] Publish comparable before/after CLI and dashboard measurements.
  - Batch: D. Backlog: OPSX-10 AC 1.
  - Layer: Integrated performance evidence.
  - Path claim: `benchmarks/read-performance/comparison.json`.
  - Proof: Re-run the U1 harness unchanged with the same fixture-copy generation, three-run warm-up, command/format cells, and one- and ten-change conditions. Report cold/warm p50/p95, counts, first frame versus comparable core data-ready, new complete Overview-section readiness separately, OpenSpec child processes, tab response, unchanged 30-second idle, edit/debounce and missed-event recovery. Show before/after differences, run-to-run variation and regressions; make no speed claim or fixed SLO without the evidence.
  - Continuation: A faster loading frame alone is not a faster usable read; retain truthful failing or inconclusive outcomes.

- [x] 5.2 [U5] Verify the complete CLI, terminal and safety contracts before closure.
  - Batch: D. Prerequisite: 5.1. Backlog: OPSX-10 AC 2.
  - Layer: Consumer-visible end-to-end verification.
  - Path claim: `benchmarks/read-performance/comparison.json` for evidence; changed production and existing test paths remain those owned by U2–U4.
  - Proof: Run affected behavior tests, `bun run typecheck`, real pilotty read/navigation/resize interactions at both sizes, no-color and reduced-motion checks, and `openspec validate improve-opsx-read-performance-and-terminal-ux --strict` because this change adds behavior specs. Confirm CLI/JSON meaning, authoritative Overview specification/requirement counts and separate active/completed lists, Unknown/read-error truth, read-only tabs and unchanged Settings/MCP approval boundaries. In the running dashboard, observe a coherent new authoritative view after a real debounced edit and a deliberately missed notification; over the unchanged 30-second idle interval, verify the displayed state remains available/unchanged and idle activity is distinguishable from a refresh. Record actual results in OPSX-10 notes.
  - Continuation: Reconcile all five Backlog group AC sets against these OpenSpec checkboxes and their independent proof before declaring implementation complete; leave mismatches open for investigation.

## Next Handoff

`openspec instructions apply --change "improve-opsx-read-performance-and-terminal-ux" --json`
