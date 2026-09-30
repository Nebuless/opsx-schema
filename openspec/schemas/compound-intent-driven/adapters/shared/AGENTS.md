# Compound Adapter Canonical Source

## Purpose

Seven host-neutral `/opsx-ce-*` command bodies under OpenSpec lifecycle control.

## Ownership

This directory owns the seven command bodies of the project-local Compound schema. It is not the packaged adapter source: `resources/openspec/schemas/compound-intent-driven/adapters/shared/` owns nine bundled bodies, including continue and bulk-continue. Select the intended tree before editing.

## Local Contracts

`opsx-ce-define`, `opsx-ce-plan`, `opsx-ce-work`, `opsx-ce-debug`, `opsx-ce-review`, `opsx-ce-validate`, `opsx-ce-compound`.

## Work Guidance

- Resolve change, read OpenSpec status/instructions and concrete context files before action.
- Treat CLI `artifactPaths`, `resolvedOutputPath`, and `changeRoot` as layout authority. Specs globs require non-empty capability files and refreshed `existingOutputPaths`, not directory-only completion.
- Continue from approved artifacts. Never ask for plan/work scope already recorded there.
- Define owns a proposal/specs envelope: grounded conditional research, ideation and brainstorming, then one-question-at-a-time material decisions. Write concrete CLI-resolved specs and stop before design; recommend explicit plan design without executing it.
- Plan owns one explicitly selected artifact. Design/tasks carry stable unit, task, batch, dependency layer, path claim, proof, and continuation fields; OpenSpec artifacts remain the only durable state.
- Work coordinates all approved dependency-ready tasks.md batches; an explicit task narrows scope. Workers own one task each, coordinator owns proof-backed checkboxes. At most 5 parallel workers; fewer than 3 is valid when fewer independent tasks exist. Serialize overlapping claims and shared resources.
- Pre-created outer-owned worktrees require baseline, isolation, and authority checks. Adapters/workers never create, merge, delete, or transfer worktrees. Isolated results await outer integration and authoritative proofs before task completion.
- Restrict writes to owned changeRoot artifacts, packet-authorized implementation/test paths, or the single already authorized eligible learning. No separate research, plan, queue, or tracker files.
- Every exit, including each worker, returns: Outcome; Change/Schema/Artifact-or-task/Batch/Worker/Dependency layer; Proof; Mutations; OpenSpec state; Continuation; Blocker; Next command. Use explicit values or none; report unavailable evidence honestly. Packets are handoffs, not a second state model.
- Next command is one resolved, exact recommendation, never execution or automatic stage selection. Preserve store routing. On unresolved selection or unsafe continuation, return a safe inspection command or none with the decision required.
- Stop on blockers, no-op, stale state, or missing claims. Refresh OpenSpec metadata before dispatch and after mutation; never loop unchanged inputs. Questions only for unresolved material decisions, not settled scope.

## Verification

- No separate CE plans or trackers.
- No commits, branches, pushes, issues, PRs, shipping, or automatic stage advancement.
- Do not replace OpenSpec task tracking, validation, or artifact ownership.

## Child DOX Index

No child DOX files. Projection paths stay outside this subtree.

## Projection Parity

For packaged adapter changes, keep bundled command bodies byte-identical to these projections relative to `resources/` (OpenCode adds description frontmatter). A shared-only delegated edit must report pending projection parity rather than edit outside its authorized scope:

```text
.opencode/commands/
.senpi/prompts/
.pi/prompts/
.atomic/prompts/
```

Run from the repository root:

```sh
sh resources/scripts/test-compound-adapters.sh
sh resources/scripts/test-install-compound-adapters.sh
```

These checks verify packaged resources only. A local command-body edit still requires the selected OpenSpec change's own proof; a passing bundled check does not prove local projection parity.
