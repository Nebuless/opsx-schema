# ADR Review Manifest

- Status: completed
- Review date: 2026-09-23

## Review Summary

The design refines read scheduling, invalidation, and presentation within the existing OpenSpec-authoritative application. It does not change the project's lifecycle authority, schema-revision model, or guarded Settings and provider-approval boundaries. No new material, long-lived architecture decision requires a repository ADR.

## Proposed ADRs Reviewed

- None are marked Accepted. The repository's ADR 0001–0003 are marked Proposed; this manifest does not change their status.

The following proposed ADRs were reviewed as context, not as ratified authority. This change's own proposal and requirements carry the safety constraints for its implementation:

- `adr/0001-cli-runtime-and-authority.md` — Bun application boundary, OpenSpec lifecycle authority, shared CLI/TUI domain, and read-only browsing.
- `adr/0002-schema-revisions-and-provenance.md` — immutable named revisions, OpenSpec pins, and provenance distinction.
- `adr/0003-schema-switch-and-validation.md` — guarded composite schema Apply, compatibility validation, and separate interactive MCP provider approval.

## New Durable ADRs Created

- None — the baseline-first measurement, bounded read fan-out, demand-scoped panels, and change-aware reconciliation are scoped implementation decisions; they introduce no new policy beyond this change's requirements and the proposed ADR context.

## Next Handoff

`openspec instructions tasks --change "improve-opsx-read-performance-and-terminal-ux" --json`
