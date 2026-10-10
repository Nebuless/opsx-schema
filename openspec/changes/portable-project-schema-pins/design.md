## Context

Public `origin/main` at `0bb39fd185625545e097088f37955b26272e0ad4` still stores a revision's resolved absolute source and treats a different source as shadow before independent digest and retained-snapshot checks. The original issue #10 implementation at `e82d2d0` was reviewed on an unrelated history. This change ports its approved behavior into the public module layout, not its original files wholesale. Public `src/cli/{shared,create,read,archive,handoff}.ts`, `src/domain/cli/commands/lifecycle.ts`, `src/project-lock.ts` and current resource/validation code own the corresponding behavior. The public selected workflow is `intent-driven-design`; there is no authorized `plan.md` gate.

Source ADR 0005 (approved on 2026-10-07 at pre-receipt SHA-256 `110a3da218eaa32abb2741543f52938ead220dc9c4a94415fa947088a604eaaa`) refines immutable revision history and guarded writes. The later approved C2 amendment settles position-indexed association establishment and version-1 compatibility. Public ADR 0002, 0003 and 0007 remain in force. This design retains those decisions without copying unrelated ADR files or changing their status.

## Goals / Non-Goals

**Goals:** Prove only genuine linked-worktree relocation, retain all integrity checks, fold one truthful effective history, provide reviewed same-name re-pin and durable exact-once recovery, and keep CLI/validation/skill consumers consistent. Adapt source tests to public APIs and verify actual packaged behavior.

**Non-Goals:** Portable identity across independent clones or moved common directories; remote/commit/byte/suffix identity; automatic legacy backfill; content migration; new default/config; skill installation/removal; replacing OpenSpec authority; release/version/tag/publication.

## Selected Direction

### Origin and health

New Git-tracked project-local references retain the absolute `source` and add an optional validated version-1 witness: canonical absolute Git common-directory path, decimal-string device/inode from a nontruncating stat, and slash-normalized relative path exactly `openspec/schemas/<name>`. Partial or unknown witness versions are errors, not legacy. Non-Git/non-project sources retain absolute semantics; a purported project-local Git origin with unsafe linkage cannot silently downgrade.

At each recorded-to-live comparison, independently verify the canonical project root, Git directory pointer and back-reference, live common directory and its directory identity, source containment and the tracked `schema.yaml`. Reject nested repositories, symlinked or redirected `.git`, schema or intermediate OpenSpec path components, untracked files, malformed or failed Git output, and Git environment/config redirection. Resolve the strict origin root independently of the OpenSpec subprocess project root; an OpenSpec root that traverses redirected intermediate components cannot bless the witness. Use Git argument arrays with bounded time/output. A witnessed pin survives removal of its original worktree only while the same common directory survives. Exact historical ref equality includes source, witness and bundle metadata and never calls Git; preview freshness stays exact across worktrees.

For an absolute-only legacy receipt, equal source paths retain existing semantics. If paths differ, the old source and original worktree root must still be reachable and both old and current roots must independently verify tracked schemas under the same live Git common directory. No read writes a witness. Name, content digest, retained snapshot, real shadow, bundle identity, non-project origin and ownership checks remain separate.

### Provenance and association

Keep version-1 receipts parseable and earlier entries byte-preserved. Optional ordered `rePins` events carry unique operation ID, time, position after a migration count, exact from/to references and explicit association before/after. Fold from the retained-or-created base, apply events at their recorded migration positions in array order, then each migration; require exact chain links, valid bounds/order and final agreement with the live pin and top-level association. Creation, retention, handoff/migration and archive writers must preserve all known history. Later migration begins at the re-pinned effective reference.

Version 2 adds an ordered association-establishment array with exact migration and re-pin counts, including an empty array where no selection was reviewed. Creation and explicit selection reconciliation append establishment before dependent transitions. Associated migration uses a validated before/after pair bound to exact from/to refs and reviewed target. Strict folding rejects missing, partial, duplicate, out-of-order, out-of-bounds or mismatched evidence. Version-1 paired migration history remains readable for display, but its before field cannot establish authority for another write. A valid association-only legacy prefix may upgrade through explicit current-selection review without changing earlier entries. Ambiguous paired history remains read-only; do not fabricate a predecessor or supply an implicit repair.

### Re-pin transaction

Add a focused `src/cli/repin.ts` operation routed through `src/domain/cli/commands/lifecycle.ts` and help in `src/domain/cli.ts`; reuse public shared lifecycle parsing and result contracts. Do not copy original `src/cli/index.ts` or its private lock. Existing standalone associated handoff continues refusing migration. The reviewed associated migration path remains `schema switch --migrate` with explicit target selection.

`change re-pin <change> <schema>` previews one existing explicit same-name `.openspec.yaml` pin. Require known effective prior ref, identical digest, intact retained snapshot, fully tracked/witnessed unshadowed target and current ownership. A healthy identical origin is a no-op. Strict workflow validation against retained/target-equivalent bytes remains mandatory. Only the explicitly reviewed historical-origin mismatch may be allowed for this re-pin operation; every other validation result remains mandatory, including incomplete workflow and a genuine target shadow. This exception is operation-scoped and must never weaken ordinary validation. For an associated change require explicit compatible `--bundle`, repeated `--profile` and `--skill-host` selection, using `--no-profiles` for an explicitly empty profile set; reject `--profile` with `--no-profiles`. Validate declaration, manifests, already installed targets, physical sharing and ownership. Different selection uses the separate skills workflow. Re-pin changes no pin, default, artifact, retained or installed bytes.

A fresh apply token binds exact project/change, raw pin/provenance identity and bytes, prior effective ref, retention, target witness/digest, validation inputs, association/manifests/owned targets and journal state. Under the existing `src/project-lock.ts` project-first lock, re-resolve and recheck all inputs before writing. Refuse unresolved switch/re-pin journals. Persist a bounded versioned re-pin journal with exact expected and intended provenance bytes/digests via exclusive owned temp, file fsync, guarded rename and parent fsync. Guard one `.opsx-provenance.json` replacement by expected identity/mode/raw bytes; fsync intended bytes and parent, validate one new event and live effective state, then mark journal complete. Unsupported durability fails explicitly. Do not steal stale locks, delete unrelated temp files or guess rollback. External editors do not share the lock, so guard write boundaries and report observed conflicts rather than claiming exclusion.

`--recover` is read-only inspection. A separately fresh-token-confirmed recovery takes the same lock, validates journal version/paths and live preconditions, and compares raw authoritative bytes: unchanged expected bytes may replay the exact intended bytes once; exact intended bytes may complete after postflight; anything else is conflict and leaves evidence. Recheck route, live inputs and journal stage before activation and after durability completion. A completed version-1 journal may be read for historical inspection; a pending version-1 journal cannot be applied by version-2 recovery. Completed retry is idempotent. Cleanup may remove only still-owned temp evidence after durable completion; conflict/partial evidence remains. Recovery may require the operator to resolve an exact abandoned lock after confirming the writer is terminated; no PID-only automatic unlock.

## Implementation Guardrails

- Port in six ordered slices: (1) origin/witness codec and health with real Git fixtures; (2) exact provenance folding/history writers, then all effective consumers; (3) read-only preview; (4) guarded apply and journal on shared lock; (5) fresh-process recovery and races; (6) CLI/package proof, docs, DOX and independent review. Do not mark source-complete work as target-complete.
- Audit every `.source` comparison and latest-migration fallback in revision, provenance, CLI, switch, validation and snapshot paths. Preserve exact comparison for history and stale previews, and origin-aware comparison only for live health.
- Preserve public `src/project-lock.ts`, resource collision recovery, JSON envelope and nonzero errors. Reuse shared/create/read/archive/handoff modules instead of adding a monolithic lifecycle layer. No new dependencies, host writes or package metadata changes.
- Test real linked worktrees, removed original, independent clone and replaced common directory; directed path components, nested repositories, untracked schema, corrupt retention, bundle/shadow/ownership failures; version-1/2 history; associated migration; stale token, concurrency, crash boundaries, absent/present/conflicted recovery and packaged CLI. Snapshot bytes to prove read/refusal and restricted Apply invariants.

## Alternatives Considered

- Absolute path equality falsely marks linked relocation as shadow.
- Matching bytes, suffix, remote, commit or copied marker does not prove common origin.
- Same-name handoff cannot safely repair an unhealthy source and cannot transfer skill association.
- Importing original monolithic CLI, private switch lock or private OpenSpec schema would conflict with public ownership and workflow gates.

## Risks / Trade-offs

- Device/inode and fsync evidence are local-platform properties. Linux proof does not establish macOS or cross-filesystem support; unsupported cases fail closed. Macroscope is an independent review service, not macOS testing.
- A malicious local actor who can rewrite trusted Git/provenance files is outside this local evidence model. Cooperative locks and guarded bytes detect observed races, not every noncooperating edit.
- Older clients may ignore new witness/re-pin fields; preserve read compatibility where specified and never claim an old binary can mutate version-2 history safely.
- The public branch's newer contracts and tests must be rerun after adaptation. Original 326-test/2953-assertion proof, package smoke and review receipts are historical source evidence only.

## Migration Plan

New witnessed refs and version-2 association evidence are written on new reviewed operations; reads never backfill legacy receipts. Explicit re-pin appends a new event without rewriting past entries. The coordinator integrates verified slices in atomic local commits, independently reviews the result, then handles approved PR/CI/Macroscope delivery on the exact latest SHA. Version, tag and publication need separate authorization.

## Open Questions

- No material behavior choice remains open in the approved scope. Any newly discovered conflict with current public behavior requires coordinator reconciliation before claiming final delivery.
