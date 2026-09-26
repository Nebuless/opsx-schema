# ADR Review Manifest

- Status: completed
- Review date: 2026-09-24

## Review Summary

Reviewed all current repository ADRs against the selected visual and skill-host direction. The existing authority, provenance and recoverable-Apply decisions remain in force. Selective termcn rendering, the motion policy and a distinct host-selection dimension are bounded implementations of existing decisions, not new competing lifecycle authority. No accepted ADR is amended. If implementation research discovers a host contract that requires a different transaction or ownership model, pause and record a new/superseding ADR before implementation instead of silently overriding ADR 0003.

## In-Force ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md`: React OpenTUI on Bun, four tabs, read-only browsing, Settings-only writes, independent interactive MCP approval and Unknown task progress remain unchanged.
- `adr/0002-schema-revisions-and-provenance.md`: selected change pins, retained revisions and provenance history remain intact; the redesign does not migrate changes implicitly.
- `adr/0003-schema-switch-and-validation.md`: staged choices, exact target effects, safe shared ownership, journal/recovery and separate provider approval are maintained; OMP/Atomic skill hosts must participate in the guarded operation rather than bypass it.

## New Durable ADRs Created

- None - no major durable architecture decision beyond the in-force authority and Apply boundaries has been introduced at planning time.
