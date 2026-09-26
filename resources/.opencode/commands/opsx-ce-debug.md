---
description: Debug one bounded OpenSpec failure
---
# Debug One OpenSpec Failure

Use CLI artifactPaths, resolvedOutputPath, and changeRoot as layout authority. Read concrete existingOutputPaths and contextFiles, never guessed files. Required specs must contain non-empty <changeRoot>/specs/<capability>/spec.md files; an empty directory is not completion. Missing metadata blocks work.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including settled proposal/specs/design/ADR/tasks, and relevant failing code. Stop if apply is blocked. Require one selected task or named failure mapped to an existing task, even if already checked. Build a packet containing taskId, instruction, failure evidence, named proof, settled decisions, and allowed mutation paths. Missing ownership or reproduction evidence blocks a fix.

Preserve settled artifacts instead of re-asking plan/work scope. Reproduce before fixing; isolate root cause, add or use a regression proof, make a bounded failure fix, then rerun reproduction and affected named proofs. Allow only selected task-owned implementation/test paths authorized by the packet and its owned OpenSpec checkbox within changeRoot. Never mark completion without passing proof. If the contract or design must change, report a blocker for the owning artifact; do not rewrite scope or pursue unrelated failures.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after this failure.

Run only safe local proofs. Stop on blockers, no-op, or stale task/artifact state; never retry unchanged inputs or broaden the failure scope. No adapter-managed worktrees or artifacts outside changeRoot beyond authorized task implementation/test paths.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof, mutations, blocker, and refreshed status in this universal result packet: Outcome (completed/blocked/no-op/stale); Change/Schema/Artifact-or-task/Batch/Worker/Dependency layer (explicit IDs from the approved envelope, none if inapplicable); Proof (reproduction before/after and commands/results); Mutations (exact paths and checkbox changes); OpenSpec state (refreshed status or unavailable); Continuation (remaining task scope and prerequisites); Blocker (or none); Next command (one exact command, not executed). After a proven fix return `/opsx-ce-work "<change>"` only for a recorded active apply envelope with remaining ready work; otherwise return `openspec status --change "<change>" --json` for reconciliation. Blocked/stale outcomes return a safe status/instructions command, or `none` plus the required decision when no command is safe. Substitute resolved values and retain named-store selection. Report unavailable CLI honestly; never install a runtime.
