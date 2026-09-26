# project-read-responsiveness Specification

## Purpose
Keeps project reads current and the dashboard responsive with comparable performance evidence and explicit data readiness.

## Requirements

### Requirement: Comparable performance evidence
Project-read performance evidence SHALL compare like-for-like cold and warm runs before and after a read-path change; it MUST distinguish initial visibility from completion of usable data and MUST NOT impose a fixed latency target before the baseline is recorded.
For this comparison, a cold sample SHALL start a new CLI process or PTY session on a disposable fixture copy without a measured-workload warm-up on that copy; a warm sample SHALL start a new process or session after three unmeasured repetitions of the same workload on that copy. Neither condition claims an OS page-cache flush. CLI sampling cells SHALL identify command, fixture size, output mode, and cold/warm condition; before and after SHALL use the same protocol and report the observed host/cache limitations. Dashboard startup SHALL report the existing core project-data-ready point separately from any newly added Overview section readiness so adding summary content is not mistaken for a like-for-like latency gain.

#### Scenario: Record a baseline and compare a candidate
- **GIVEN** fixed project fixtures with one and ten active changes and the same host, commands, dashboard navigation, and run conditions for baseline and candidate measurements
- **WHEN** maintainers record the baseline and the post-change results for CLI status, changes, relevant schema reads, dashboard tab changes, and one edit/debounce plus an unchanged idle observation
- **THEN** the evidence reports cold and warm p50 and p95, sample counts, OpenSpec child-process counts, dashboard first-visible-frame and data-ready times as separate measures, and before/after differences and regressions; it identifies run-to-run variation and selects no hard latency target until these results are available

### Requirement: OpenSpec-authoritative CLI reads
CLI project reads SHALL present current OpenSpec-authoritative state while preserving the existing command grammar, freshness, schema pins, provenance, archive distinctions, and error behavior.

#### Scenario: Read current project state after it changes
- **GIVEN** a project whose OpenSpec state, schema revision, provenance, or archive contents have changed since an earlier read
- **WHEN** a caller requests a subsequent project read
- **THEN** the result reflects the current authoritative project state rather than presenting an older cached view as current, and retains the existing distinctions and error behavior for that state

#### Scenario: Compare compact and JSON projections
- **GIVEN** the same project state and equivalent CLI read requests in compact/text and JSON modes
- **WHEN** an agent compares the completed responses
- **THEN** both responses describe semantically equivalent OpenSpec state, including unknown or unavailable values, without inventing task progress or changing the command grammar

### Requirement: Truthful dashboard data readiness
The dashboard SHALL distinguish an early visible frame from a completed, usable project-data read and MUST show readiness only when the data represented as ready has been obtained.

#### Scenario: Distinguish loading, ready, empty, and failed reads
- **GIVEN** the dashboard is opening a project view whose data is pending, empty, or has failed to load
- **WHEN** the view renders its initial frame and then receives the read outcome
- **THEN** the initial frame is not represented as data-ready, and the final state truthfully distinguishes loaded data, a loaded empty result, and an error without fabricating task progress

### Requirement: Quiescent unchanged projects
An unchanged idle project SHALL remain usable without repeatedly performing full OpenSpec reads solely because time has elapsed, while retaining the ability to discover missed filesystem changes.

#### Scenario: Observe an unchanged project while idle
- **GIVEN** the initial project snapshot is loaded and no relevant project files change during the proposal's 30-second idle observation
- **WHEN** the dashboard remains open and the idle interval elapses
- **THEN** the displayed project state remains available and unchanged, no repeated full snapshot/OpenSpec-process work is triggered solely by the elapsed interval, and idle activity is distinguishable from a project refresh

### Requirement: Debounced edits and missed-event reconciliation
A real project edit SHALL become visible as a coherent refreshed view after the edit burst settles, and a missed filesystem notification MUST NOT leave the displayed project state stale indefinitely.

#### Scenario: Coalesce a burst of edits
- **GIVEN** the dashboard is showing a project snapshot and several relevant file changes occur within one debounce window
- **WHEN** the edit burst settles
- **THEN** the dashboard refreshes to a coherent view of the resulting project state rather than repeatedly exposing intermediate refreshes for each event

#### Scenario: Reconcile a missed filesystem event
- **GIVEN** a relevant file has changed or a relevant path has been created but no filesystem notification reached the watcher
- **WHEN** project reconciliation next observes the change
- **THEN** a fresh authoritative project view is produced and shown, and the missed event does not leave the prior snapshot presented as current

Next OpenSpec command after both capability specs are present: openspec instructions design --change "improve-opsx-read-performance-and-terminal-ux" --json
