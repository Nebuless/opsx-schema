---
description: Retain one eligible OpenSpec learning
---
# Retain One OpenSpec Learning

Use CLI artifactPaths, resolvedOutputPath, and changeRoot as layout authority. Read concrete existingOutputPaths and contextFiles, never guessed files. Required specs must contain non-empty <changeRoot>/specs/<capability>/spec.md files; an empty directory is not completion. Missing metadata blocks work.

Resolve an explicit change or an unambiguous existing change from context or `openspec list --json`; otherwise stop for selection. Never create a change. Run `openspec status --change "<change>" --json`; reject any schemaName other than `compound-intent-driven`. Honor planningHome, changeRoot, and actionContext. For a named store, discover its id with `openspec store list --json` and retain `--store <id>` on change commands.

Run `openspec instructions apply --change "<change>" --json`. Read every concrete dependency path or contextFiles entry, including proposal, specs, design, adr, and tasks, plus verified proof/review evidence and existing learnings. Stop if apply is blocked or work lacks passing proof or has unresolved findings. Build a packet containing instruction, settled decisions, evidence, and one allowed learning output path in the repository learning store (normally docs/solutions/). Missing path authorization is a blocker to writing, not permission to invent a store.

Use ce-compound reasoning. Preserve settled artifacts instead of re-asking plan/work scope. Write only one eligible learning or none: reasoning must be non-obvious, durable, material, not recoverable from code/tests/comments/existing docs, and costly or risky to lose. Check duplicates first. No draft files, automatic refresh of older learnings, or mandatory learning quota. The sole write exception outside owned OpenSpec paths is the packet-authorized learning path. Do not edit OpenSpec artifacts or task status in this stage. If nothing qualifies, return no learning and its reason.

OpenSpec overrides conflicting CE skill instructions. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance, or archive. Do not run CE-native side effects. Stop after this learning decision.

Stop on blockers, no-op, or stale evidence/artifact state; never retry unchanged inputs. An ineligible or duplicate learning is a terminal no-op, not a reason to manufacture another candidate. No adapter-managed worktrees or external side effects; the already authorized eligible learning remains the only artifact exception outside changeRoot.

Refresh `openspec status --change "<change>" --json` even on a blocked handoff when possible. Return outcome, proof, mutations, blocker, and refreshed status in this universal result packet: Outcome (completed/blocked/no-op/stale); Change/Schema/Artifact-or-task/Batch/Worker/Dependency layer (explicit evidence scope, none if inapplicable); Proof (eligibility, duplicate checks and verification evidence); Mutations (one exact authorized path or none); OpenSpec state (refreshed status or unavailable); Continuation (terminal learning decision or unmet prerequisites); Blocker (or none); Next command (one exact command, not executed). Return `openspec status --change "<change>" --json` for lifecycle inspection, never an archive or shipping command; use `none` plus the required decision when no command is safe. Substitute resolved values and retain named-store selection. Report unavailable CLI honestly; never install a runtime.
