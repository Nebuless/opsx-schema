## Why

Issue #10 exposes a false schema shadow when the same Git-tracked project-local schema is used from another linked worktree. Existing revision receipts hold a checkout-specific absolute source path, so source inequality can fail before content and retained-snapshot checks. The approved fix must accept only an origin that remains independently provable.

## Scope

- Identify Git-tracked project-local schema origin across linked worktrees sharing the same still-resolvable Git common directory.
- Preserve name, digest, retained snapshot, real shadow, bundle, non-project-origin and ownership checks independently.
- Keep absolute-only legacy receipts readable and prove automatic cross-path equivalence only while both linked worktrees remain verifiable. For a vanished old project-shaped source, offer explicit reviewed same-name re-pin with a warning that its former location cannot be verified and confirmation that this change should use the verified current location.
- Preserve exact append-only provenance and reviewed skill association through re-pin, later migration, archive and recovery.
- Adapt implementation and tests to public modular CLI and shared project lock, then prove package behavior and submit for independent review.

## Exclusions

- No automatic acceptance based on matching bytes, path suffix, remote, commit or copied marker; no automatic legacy backfill. Manual missing-source repair does not authenticate historical project ownership or admit known reachable non-project sources, arbitrary old path kinds or unsafe components.
- No schema default, OpenSpec config, resource digest, installed skill, host configuration or artifact-body change as part of re-pin.
- No new schema workflow, private `plan.md` gate, unrelated Backlog or source-tree import. No version, tag, release or publication work.

## What Changes

Pinned project-local revisions gain a verifiable origin witness. Revision health and every effective-ref consumer distinguish linked relocation from real origin/content/retention drift. A separate read-only re-pin preview and fresh-token guarded Apply may append a new effective provenance origin after exact safety and association review; recovery can inspect and complete the same durable intent without inventing history. Missing legacy source repair explicitly accepts uncertainty about the old location while verifying the new one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-revisions-and-migration`: portable project origin, strict effective provenance and association history, explicit re-pin and recovery while keeping the existing immutable revision contract.
- `project-and-agent-cli`: consistent diagnostics and focused preview/Apply/recovery command behavior with actionable fail-closed guidance.

## Selected Direction

Use ADR 0005 and its C2 amendment with the narrow user-approved ADR 0008 manual-repair clarification within public `intent-driven-design`. A shared Git common-directory identity proves only live local linked-worktree ownership; all other safety checks remain separate. A vanished legacy source remains unauthenticated even if its old path has the eligible project shape. Its re-pin requires a warning, confirmation and a verified current location, not an inference about the past.

## Impact

Project owners can use an intact pinned schema from another linked worktree without a false shadow. Independent clones, moved common directories and ambiguous legacy history remain unhealthy until explicit review. Eligible vanished-source legacy changes can be manually repaired with disclosed uncertainty; known reachable non-project sources remain outside this exception. Public CLI, revision/provenance and switch/validation consumers need coordinated changes and regression proof. Original test results are historical and cannot establish public-port completion.
