# ADR 0007: Reviewed single-target unmanaged skill replacement

Status: Proposed
Date: 2026-09-29

## Context

The ordinary schema switch and skill installer correctly refuse unmanaged skill collisions. Issue #5 required manual backup of five existing OMP skill trees before installing the declared set. Explicitly authorizing replacement risks loss of unowned content and a race with active change pins. The resource lock alone does not serialize change creation, handoff, archive, selection reconciliation, or schema switching's project-level writes. The existing schema-switch journal describes its own transaction, not a backup of an unrelated user-owned tree.

## Decision

Expose a separate preview/token-authorized replacement of **one exact unmanaged skill target** at a time, followed by the ordinary fresh full-set switch. Derive source and every physical consumer from verified installed schema/host/profile declarations; refuse ambiguous mapping, managed drift, incomplete pin evidence, unsafe paths, and active-required targets. A caller-selected unique backup ID fixes the preview/Apply path across processes. Copy and verify the complete old tree before a same-parent staged swap and ownership write. Persist a versioned phase receipt and retain verified backup; a separately reviewed restore can reverse only unchanged transaction-owned target and ownership state when the current complete active-pin guard proves no change requires that target. Partial or externally changed state fails closed with exact recovery evidence. No implicit adoption, force flag, migration, or claim that the other collisions were fixed.

Coordinate replacement, restoration, schema switching and **all Opsx-controlled active pin/selection writers** through one project lock protocol, taking the project lock before the resource lock when both apply. Recheck pins, source, target and ownership while locked and at write boundaries. Standalone OpenSpec commands and external filesystem editors do not honor Opsx locks; detect observed drift and refuse, but do not claim an atomic guarantee against non-cooperating writers. Preserve OpenSpec as authority for change lifecycle and the existing switch recovery journal as a distinct transaction.

## Consequences

- Normal install/switch collision refusal and the separate schema, skill, adapter and MCP boundaries remain intact. Each chosen target costs one preview/token Apply, backup storage and later optional restore.
- All Opsx-controlled active-pin writers must adopt the same lock order before replacement Apply is exposed. A resource-only lock or a new replacement-only lock does not make pin requirements stable; external OpenSpec/editor races remain outside its atomic guarantee.
- A crash after a swap may leave both original and replacement trees plus a partial receipt. Automatic rollback is conditional; user edits are never overwritten to make the receipt look complete.
- Existing backed-up history is not provenance for an older OpenSpec change. Unknown creation revision remains unknown and verification remains nonzero where blocked today.

## Alternatives considered

- Documentation-only manual copy/verify: least code, but leaves the reported recovery error-prone; remains a fallback for states that cannot be reversed automatically.
- `--force` in composite schema switch or all-target batch: increases irreversible effects and rollback surface while hiding per-target ownership review.
- Adopt a same-name or byte-identical unmanaged tree: confuses content equivalence with permission to claim ownership.
- Rename target directly into internal backup: cross-device failure can occur, and it removes the only old copy before verification.
- Resource-lock-only implementation: pin writers are not serialized by it.

## Revisit when

Reconsider batching only if repeated single-target transactions prove impractical and an atomic multi-target recovery model is separately reviewed. Do not widen authorization through an installer flag.

## Related decisions and change

Supplements [ADR 0001](0001-cli-runtime-and-authority.md), [ADR 0002](0002-schema-revisions-and-provenance.md), and [ADR 0003](0003-schema-switch-and-validation.md); supersedes none. [Issue #5 change](../openspec/changes/omp-installation-friction/).
