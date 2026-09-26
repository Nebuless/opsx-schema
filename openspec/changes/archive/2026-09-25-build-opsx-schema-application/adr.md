# ADR Review Manifest

- Status: completed
- Review date: 2026-09-23

## Review Summary

The design's long-lived authority, revision, transaction, and validation decisions are recorded in the three Proposed ADRs created during this change's planning. They remain proposals, not accepted policy. The earlier planning location is superseded by the selected schema's repository-level `adr/` location; relocation does not change their decision status. No accepted repository-level ADR was edited or superseded.

## In-Force ADRs Reviewed

- None - no Accepted repository-level ADR was found.

## New Durable ADRs Created

- `adr/0001-cli-runtime-and-authority.md` - Proposed; Bun CLI/TUI boundary and OpenSpec lifecycle authority.
- `adr/0002-schema-revisions-and-provenance.md` - Proposed; named revision retention and per-change history.
- `adr/0003-schema-switch-and-validation.md` - Proposed; recoverable schema Apply, MCP approval and artifact/workflow gate.

## Next Handoff

`openspec instructions tasks --change "build-opsx-schema-application" --json`
