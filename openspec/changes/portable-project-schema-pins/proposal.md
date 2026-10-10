## Why

Issue #10 exposes a false schema shadow when the same Git-tracked project-local schema is used from another linked worktree. Existing revision receipts hold a checkout-specific absolute source path, so source inequality can fail before content and retained-snapshot checks. The approved fix must accept only an origin that remains independently provable.

## Scope

- Identify Git-tracked project-local schema origin across linked worktrees sharing the same still-resolvable Git common directory.
- Preserve name, digest, retained snapshot, real shadow, bundle, non-project-origin and ownership checks independently.
- Keep absolute-only legacy receipts readable, prove cross-path equivalence only while both linked worktrees remain verifiable, and guide ambiguous cases to explicit reviewed same-name re-pin.
- Preserve exact append-only provenance and reviewed skill association through re-pin, later migration, archive and recovery.
- Adapt implementation and tests to public modular CLI and shared project lock, then prove package behavior and submit for independent review.

## Exclusions

- No acceptance based on matching bytes, path suffix, remote, commit or copied marker; no automatic legacy backfill.
- No schema default, OpenSpec config, resource digest, installed skill, host configuration or artifact-body change as part of re-pin.
- No new schema workflow, private `plan.md` gate, unrelated Backlog or source-tree import. No version, tag, release or publication work.

## What Changes

Pinned project-local revisions gain a verifiable origin witness. Revision health and every effective-ref consumer distinguish linked relocation from real origin/content/retention drift. A separate read-only re-pin preview and fresh-token guarded Apply may replace only the effective provenance origin after exact safety and association review; recovery can inspect and complete the same durable intent without inventing history.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-revisions-and-migration`: portable project origin, strict effective provenance and association history, explicit re-pin and recovery while keeping the existing immutable revision contract.
- `project-and-agent-cli`: consistent diagnostics and focused preview/Apply/recovery command behavior with actionable fail-closed guidance.

## Selected Direction

Use the source-approved ADR 0005 decision and C2 association amendment within public `intent-driven-design`. A shared Git common-directory identity proves only live local linked-worktree ownership; all other safety checks remain separate. Where proof is unavailable, require reviewed same-name re-pin rather than inferring the past.

## Impact

Project owners can use an intact pinned schema from another linked worktree without a false shadow. Independent clones, moved common directories and ambiguous legacy history remain blocked until explicit review. Public CLI, revision/provenance and switch/validation consumers need coordinated changes and regression proof. Original test results are historical and cannot establish public-port completion.
