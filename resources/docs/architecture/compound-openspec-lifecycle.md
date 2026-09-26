---
title: Compound OpenSpec Lifecycle Orchestration
date: 2026-09-22
status: implemented
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
---

# Compound OpenSpec Lifecycle Orchestration

## Goal Capsule

Make `compound-intent-driven` install a coherent agent workflow from discovery through archive. Keep OpenSpec authoritative for change state, artifact readiness, paths, task status, sync, and archive. Keep Compound Engineering authoritative only for its six focused reasoning loops.

Blockers: none.

## Product Contract

### Summary

Current package deploys disconnected pieces:

- `skills.txt` installs six upstream Compound Engineering skills: `ce-brainstorm`, `ce-plan`, `ce-work`, `ce-simplify-code`, `ce-code-review`, and `ce-compound`.
- Seven `/opsx-ce-*` adapters translate those focused skills into one OpenSpec-owned action at a time.
- OpenSpec lifecycle skills such as `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-sync-specs`, and `openspec-archive-change` exist upstream but are not declared by this schema's install manifest.

Agents therefore receive phase helpers, not one installed path that can inspect a selected change, run its next safe action, refresh authoritative state, and finish its lifecycle without manually stitching commands together.

Build two explicit continuations:

1. `/opsx-ce-continue <change>` owns one selected change and executes one deterministic lifecycle operation per invocation.
2. `/opsx-ce-bulk-continue <change...>` owns an explicit set of independently valuable changes, preflights all of them, and runs only safe disjoint operations in parallel.

Both routes use fresh OpenSpec JSON metadata. Neither creates a second tracker, silently changes change boundaries, auto-archives, or changes upstream skill behavior.

### Problem Frame

The six upstream skills are intentionally narrow. `ce-work` can run a bounded implementation plan, and `ce-compound` deliberately captures only one qualifying lesson. The seven current adapters preserve those boundaries, but their handoff ends at an exact next command. Repeated manual command choice makes a complete OpenSpec change feel like unrelated single-task invocations.

A router must remove that choreography without taking state authority from OpenSpec or turning a multi-change request into an unsafe shared batch.

### Scope Boundaries

Included:

- Source-qualified installation of upstream OpenSpec lifecycle skills needed for exploration, proposal, implementation, spec sync, and archive.
- One-change and explicit multi-change continuation adapters for `compound-intent-driven` supported hosts.
- Deterministic operation selection from fresh OpenSpec status and instructions.
- Safe batch dispatch rules, lifecycle receipts, host projection parity, installer collision handling, docs, and offline tests.

Excluded:

- Changes to upstream `ce-*` or upstream `openspec-*` skill bodies.
- A parallel CE plan, queue, task tracker, lifecycle database, or automatic stage advancement outside a router invocation.
- New host support, including an OMP command-projection format, unless that host gains a defined adapter install contract.
- Commits, branches, pushes, pull requests, release work, or automatic archive mutation.

### Key Decisions

- `session-settled:` Preserve upstream Compound Engineering skill directories unchanged. Package glue adapts to their return-to-caller and focused-action contracts; it never forks their behavior.
- `session-settled:` Install OpenSpec lifecycle skills through `skills.txt` beside the Compound skills. They remain focused helpers; routers provide traversal.
- `session-settled:` Add both routes. One change may use dependency-ready task batches. Independent product outcomes require explicit multi-change selection; no command silently splits or merges changes.
- `session-settled:` `/opsx-ce-continue` executes exactly one lifecycle operation after fresh preflight, then returns refreshed state and continuation. It is not recommendation-only and does not drive an entire lifecycle in one invocation.
- `session-settled:` Individual `/opsx-ce-*` adapters remain stage-local. Router selection authority is limited to deterministic dispatch from current OpenSpec metadata.
- `session-settled:` Sync and archive remain explicit lifecycle boundaries. Archive keeps the existing confirmation requirement; neither router invokes archive without direct user authorization.

### Requirements

#### R1 — Install full lifecycle capability

`compound-intent-driven/skills.txt` SHALL declare the current source-qualified Compound core skills plus upstream OpenSpec lifecycle skill directories for `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-sync-specs`, and `openspec-archive-change`.

The installer SHALL copy complete declared skill directories into `.agents/skills/`, retain its all-or-nothing source, collision, ownership, and symlink protections, and reject malformed or unavailable declarations before mutating a target.

#### R2 — Continue one selected change

`/opsx-ce-continue <change>` SHALL require an explicit active change or stop for selection. It SHALL read fresh `openspec status --change "<change>" --json`, reject schemas other than `compound-intent-driven`, preserve named-store routing, and use CLI `planningHome`, `changeRoot`, `artifactPaths`, `resolvedOutputPath`, `existingOutputPaths`, `actionContext`, and `contextFiles` as layout and scope authority.

After reading required concrete artifact files and current `openspec instructions`, it SHALL run exactly one operation chosen from current state. Its dispatch table SHALL be specified and tested:

| Authoritative state | Single operation |
|---|---|
| Discovery or proposal input without selected change | `openspec-explore` or `openspec-propose`; user intent selects route |
| Ready `proposal` | `/opsx-ce-define` |
| Ready `specs`, `design`, `adr`, or `tasks` | `/opsx-ce-plan` with that exact artifact |
| Apply has pending dependency-ready work | `/opsx-ce-work` for the approved batch or explicitly narrowed task |
| Implementation work settled | `/opsx-ce-review`, then a later router invocation `/opsx-ce-validate` |
| Validation passes and durable-learning eligibility remains | `/opsx-ce-compound` |
| Completed active change needs delta-spec reconciliation | `openspec-sync-specs` |
| Archive requested directly by user after sync and completion gates | `openspec-archive-change` |

When multiple planning artifacts are ready, selection SHALL follow one documented stable order from status metadata. It SHALL not infer a missing change, skip a blocked prerequisite, retry unchanged state, or execute more than one row of this table.

#### R3 — Preserve OpenSpec and bounded-worker authority

Every router dispatch SHALL use a universal result packet containing outcome, selected change/schema, artifact or task, batch, worker, dependency layer, proof, mutations, refreshed OpenSpec state, continuation, blocker, and one exact next command.

OpenSpec remains the only durable artifact, task, readiness, validation, sync, and archive authority. Routers and workers SHALL create no CE-native plan, tracker, queue, commit, branch, worktree, push, issue, pull request, or archive record. Existing outer-owned worktree and five-worker maximum rules remain unchanged.

#### R4 — Continue explicit independent changes safely

`/opsx-ce-bulk-continue` SHALL require an explicit multi-selection of active changes. It SHALL preflight each change independently and build one candidate operation and packet per change before dispatch.

It SHALL run operations concurrently only when all candidates have disjoint authorized implementation and test paths, have no shared main-spec target, and are not sync or archive operations. It SHALL serialize every overlap, sync, archive, blocked candidate, and change whose operation itself owns an internal task batch. One failing change SHALL produce its own packet without erasing successful results from other selected changes.

The command SHALL never convert one change into several changes, merge selected changes, use implicit "all changes", or treat a parent task as a change selection.

#### R5 — Keep host resources and docs coherent

Canonical adapter bodies remain under `openspec/schemas/compound-intent-driven/adapters/shared/`. New router bodies SHALL project byte-identically to `.senpi/prompts/`, `.pi/prompts/`, and `.atomic/prompts/`; `.opencode/commands/` may add only its description frontmatter.

The schema README, root install guidance, host command inventory, installer, and package allowlist SHALL describe every installed lifecycle skill and adapter accurately. The source package SHALL still omit unsupported host resources.

### Acceptance Examples

#### Scenario: Change enters through proposal

- **GIVEN** `add-audit-log` uses `compound-intent-driven` and `proposal` is ready
- **WHEN** `/opsx-ce-continue add-audit-log` runs
- **THEN** it builds the resolved proposal/specs packet, invokes only `/opsx-ce-define`, refreshes status, and returns the next exact command without planning or applying code

#### Scenario: Parallel-ready planning is deterministic

- **GIVEN** `specs` and `design` are both ready after a completed proposal
- **WHEN** `/opsx-ce-continue <change>` runs
- **THEN** it selects documented first-ready order, performs one selected artifact operation, and leaves the other ready artifact for a later invocation

#### Scenario: Independent changes run safely

- **GIVEN** two explicitly selected changes have disjoint approved paths and neither operation writes main specs or archives
- **WHEN** `/opsx-ce-bulk-continue` runs
- **THEN** each change receives one separate packet and may execute concurrently

#### Scenario: Shared resource serializes batch work

- **GIVEN** two selected changes can write the same implementation path or main specification
- **WHEN** `/opsx-ce-bulk-continue` runs
- **THEN** it serializes them in stable order and reports that reason in both packets

#### Scenario: Archive remains consent-gated

- **GIVEN** implementation, review, validation, and sync succeeded
- **WHEN** no direct archive request is present
- **THEN** either continuation router returns the archive command as next step and does not move the change

### Success Criteria

- A clean `compound-intent-driven` install exposes all declared upstream CE and OpenSpec lifecycle skills under `.agents/skills/`.
- One selected change can move through discovery, artifacts, dependency-ready work, review, validation, compound, sync, and consent-gated archive through repeated `/opsx-ce-continue` calls without manual stage mapping.
- Bulk continuation preserves per-change authority and proves no concurrent mutation path overlap.
- Existing seven adapter behaviors, host collision protections, and package extraction checks remain valid after router addition.

### Sources / Research

- `openspec/schemas/compound-intent-driven/skills.txt`
- `openspec/schemas/compound-intent-driven/schema.yaml`
- `openspec/schemas/compound-intent-driven/README.md`
- `openspec/schemas/compound-intent-driven/adapters/shared/AGENTS.md`
- `scripts/install-schema-skills.sh`
- `scripts/install-compound-adapters.sh`
- `scripts/test-compound-adapters.sh`
- `scripts/test-install-compound-adapters.sh`
- `scripts/test-artifact-layout.js`
- `.omp/skills/openspec-{explore,propose,apply-change,sync-specs,archive-change}/SKILL.md`
- EveryInc/compound-engineering-plugin `main` core skill directories, read 2026-09-22
- Fission-AI/OpenSpec `main` skill directory inventory, read 2026-09-22

### Outstanding Questions

None.
