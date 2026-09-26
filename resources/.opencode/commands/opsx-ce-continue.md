---
description: Continue one OpenSpec operation
---
# Continue One OpenSpec Operation

OpenSpec CLI JSON is lifecycle authority. Require an explicit change or an unambiguous existing change from context; never operate on all changes. Run fresh `openspec status --change "<change>" --json`, then `openspec instructions <artifact> --change "<change>" --json` when an artifact operation is ready. Honor `planningHome`, `changeRoot`, `artifactPaths`, `resolvedOutputPath`, `existingOutputPaths`, `actionContext`, and `contextFiles`; preserve named-store routing and `--store <id>`.

After status, reject any schemaName other than `compound-intent-driven`. Read every concrete dependency path and contextFiles; reuse settled artifacts instead of re-asking plan/work scope. No parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance.

The selected operation writes only its owned CLI-authorized mutation paths. Refresh `openspec status --change "<change>" --json` after each mutation and before returning.

Map ready planning artifacts in stable order: `specs`, `design`, `adr`, `tasks`. Dispatch exactly one operation per invocation: `/opsx-ce-plan` for one ready planning artifact; `/opsx-ce-define` for ready proposal; `/opsx-ce-work` only for dependency-ready implementation; then review, later validate, compound, `openspec-sync-specs`, or archive only after direct user authorization. Do not select stage automatically. Never dispatch archive without explicit direct-user consent. `openspec-archive-change` remains user-controlled.

Use CLI-resolved `artifactPaths` and concrete non-empty capability files; never guess paths or treat directory-only output as complete. Refresh status before and after mutation. Stop on blockers, no-op, stale state, unknown selection, missing metadata, or conflicting claims. Never create CE plans, trackers, queues, commits, branches, worktrees, pushes, issues, PRs, or automatic archive.

Return universal result packet with exact fields: Outcome; Change/Schema/Artifact-or-task/Batch/Worker/Dependency layer; Proof; Mutations; OpenSpec state; Continuation; Blocker; Next command (one exact command, not executed). Report mutations and blocker honestly. Include selected change/schema, artifact or task, and refreshed CLI metadata. Preserve packet even when blocked. Next command must be one resolved recommendation.
