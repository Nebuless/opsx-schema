## 1. Verifiable linked-worktree origin and revision health

- [ ] 1.1 Implement the versioned Git origin witness in public revision modules with real linked-worktree, removed-original, independent-clone, moved/replaced common-directory and redirected-path fixtures. Prove strict project-root/Git/back-reference/tracked-schema checks and no remote/commit/marker/suffix/byte bypass with `bun test test/revisions/origin.test.ts --timeout 30000`.
- [ ] 1.2 Persist and validate witnesses on applicable refs; use separate exact historical equality and recorded-to-live health, including conservative legacy proof, without read backfill. Prove independent content, retention, shadow, bundle and non-project failures and byte-identical reads with origin and invariants tests. Obtain coordinator C1 independent origin review before mutation slices.

## 2. One exact effective history across public consumers

- [ ] 2.1 Implement ordered append-only re-pin events, strict effective-ref folding, version-2 association establishment, version-1 readable/refusal policy and preservation through public create/read/archive/handoff/switch writers. Prove re-pin/migration/re-pin, associated before/after transitions, invalid chains and archived history with focused provenance and lifecycle tests.
- [ ] 2.2 Audit every source comparison and latest-migration fallback in public revision, provenance, CLI, switch, validation and snapshot modules. Keep stale preview/historical comparisons exact and live health origin-aware; preserve standalone associated handoff refusal and reviewed `schema switch --migrate` selection. Prove CLI/domain/validation/switch regressions and obtain coordinator C2 independent consumer/history review.

## 3. Read-only reviewed same-name re-pin preview

- [ ] 3.1 Add focused `src/cli/repin.ts` preview and route/help through public lifecycle/CLI modules. Require explicit exact same-name pin, unchanged digest, intact retention, tracked unshadowed target and complete compatible reviewed skill association with owned/shared target evidence, including explicit empty profiles. Run strict workflow validation against retained/target-equivalent bytes; allow only the explicitly reviewed historical-origin mismatch for this re-pin operation, and keep every other validation result mandatory. This exception must not weaken ordinary validation or allow a genuine target shadow. Prove all refusal paths write no bytes with `bun test test/cli/re-pin.test.ts --timeout 30000`.

## 4. Guarded Apply on the existing shared project lock

- [ ] 4.1 Bind a fresh token to all live inputs; under `src/project-lock.ts` recheck route, pin, provenance, witness, retention, validation, association and owned targets. Persist/fsync a dedicated bounded journal before one guarded provenance replacement; postflight, mark complete and preserve all other bytes. Prove stale token, concurrent switch/re-pin, unresolved journal, failure before activation and healthy no-op with re-pin/switch tests.

## 5. Exact-once recovery after interruption

- [ ] 5.1 Implement read-only `--recover` inspection and separately token-confirmed recovery for absent/exact-present/conflicted intent. Recheck route, live inputs and stage before activation and after durable completion; keep completed version-1 journals readable but refuse pending version-1 Apply and uncertain lock states. Retain partial evidence, clean only still-owned temp files and never guess rollback. Prove fresh-process crashes, races, idempotent replay and later migration with re-pin/provenance/switch tests. Obtain coordinator C3 independent recovery review.

## 6. Public integration proof and records

- [ ] 6.1 Adapt all issue #10 scenarios to public APIs and run focused suites, real CLI text/JSON/nonzero cases, packed-consumer preview/Apply/recovery, `bun run check`, `git diff --check` and strict OpenSpec change validation. Record exact outcomes and limits; source 8/10 and 326/2953 evidence do not complete this task. Update command/workflow docs and relevant DOX within authorized paths. Obtain coordinator C4 independent code/claim review, including all-severity LSP results, before checking this item.

## 7. Coordinator delivery after verified implementation

- [ ] 7.1 Coordinator integrates atomic reviewed local commits, opens the authorized issue #10 PR, and verifies `Commit history`, `Quality`, `Application tests`, `Resource checks`, `Package distribution smoke` plus independent Macroscope findings on the exact latest PR SHA. Resolve blocking findings and retest. Missing/pending Macroscope remains a delivery blocker. No version, tag, publication or release action belongs to this change without separate authorization.

## Current evidence boundary

All nine destination tasks are pending. Original implementation endpoint `e82d2d0` and its checked 8/10 source list are reference evidence only. Public baseline format, lint, Qlty and typecheck passed before these artifacts; four-path LSP probes were inconclusive. This artifact-only pass has strict change validation 1/1 with no issues, resolved current-public path references and Apply status ready at 0/9. Fresh all-severity diagnostics were requested for all seven authored Markdown files and `tasks.md` was retried, but the OMO LSP daemon did not become reachable; no clean LSP claim is made. No product test or delivery gate was run for this public port.

2026-10-10 independent planning re-review round 78 APPROVED implementation readiness with no new findings. F1 is closed by public ADR 0005 and its manifest, preserving prior decision approval and distinguishing the 2026-10-09 port authorization from record preparation. F2 is closed by the operation-scoped historical-origin validation exception in design, tasks and delta specs. Strict change validation passed 1/1, selected schema validation and artifact whitespace checks passed, and product/test/config/package/lock/CI paths remain unchanged. All nine reviewer Markdown LSP probes had no configured server; coordinator retry confirmed only the new ADR and manifest clean, leaving broader coverage unconfirmed. No product task is complete. Coordinator will commit this reviewed planning checkpoint before the origin/health implementation slice.
