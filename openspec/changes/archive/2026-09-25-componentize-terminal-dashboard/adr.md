# ADR Review Manifest

- Status: completed
- Review date: 2026-09-24

## Review Summary

Reviewed all repository-level ADRs currently in force against the selected component-composition direction. Passive OpenTUI React presentation components do not create a new lifecycle authority, persistence model, transaction protocol, or provider-consent path. Existing source models and keyboard ownership remain unchanged. A new durable architecture ADR is not warranted for a presentation-layer design. If implementation discovers that a truthful per-target result requires a changed switch contract, pause for a separately approved decision rather than silently extending this visual change.

## In-Force ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md`: Bun/OpenTUI React four-tab dashboard, read-only Changes/Archive, Settings-only interactive writes, non-TTY CLI behavior, and independent MCP safety confirmation remain in force.
- `adr/0002-schema-revisions-and-provenance.md`: immutable revision identity, selected pins, and provenance history remain source-of-truth data, not inferred from visual labels.
- `adr/0003-schema-switch-and-validation.md`: staged exact effects, shared-target ownership, recoverable Apply/journal and provider approval remain authoritative; presentation does not imply writes or bypass guards.

## New Durable ADRs Created

- None - no major durable architectural decision was introduced.
