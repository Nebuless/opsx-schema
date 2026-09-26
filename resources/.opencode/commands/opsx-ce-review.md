---
description: Review bounded OpenSpec work
---
# Review OpenSpec Work

Use CLI artifactPaths, resolvedOutputPath, and changeRoot as layout authority. Read concrete existingOutputPaths and contextFiles, never guessed files. Required specs must contain non-empty <changeRoot>/specs/<capability>/spec.md files; an empty directory is not completion. Missing metadata blocks work.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including proposal, specs, design, adr, and tasks, plus the scoped diff and repository standards. Stop if apply is blocked; all_done does not prevent review. Build a packet containing reviewed task IDs, instruction, settled decisions, proof criteria, and allowed mutation paths. Missing ownership is a blocker.

Use ce-code-review reasoning against the artifacts. Preserve settled artifacts instead of re-asking plan/work scope. Report verified findings with severity, path, evidence, and impact; fix only verified in-scope findings in task-owned implementation/test paths authorized by the packet. OpenSpec writes are limited to the owned task status within changeRoot, supported by rerun proofs. Do not create review trackers or change settled intent. Report out-of-scope findings without fixing them. Rerun affected named proofs after each fix; unresolved findings block completion.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after review.

Run only safe local proofs. Stop on blockers, no-op, or stale task/artifact state; never retry unchanged inputs. No adapter-managed worktrees or artifacts outside changeRoot beyond authorized task implementation/test paths. Parallel reviewers are read-only; serialize any fixes within approved claims. A clean review is completed evidence, not permission to advance automatically.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof, mutations, blocker, and refreshed status in this universal result packet: Outcome (completed/blocked/no-op/stale); Change/Schema/Artifact-or-task/Batch/Worker/Dependency layer (explicit reviewed IDs, none if inapplicable); Proof (findings, severity, evidence and commands/results); Mutations (exact paths); OpenSpec state (refreshed status or unavailable); Continuation (remaining findings and prerequisites); Blocker (or none); Next command (one exact command, not executed). For a clean completed review return `/opsx-ce-validate "<change>"`; for a mapped reproducible failure return `/opsx-ce-debug "<change>" "<task>"`. Otherwise return a safe status/instructions command, or `none` plus the required decision when no command is safe. Substitute resolved values and retain named-store selection. Report unavailable CLI honestly; never install a runtime.
