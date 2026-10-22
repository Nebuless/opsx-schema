# ADR Review Manifest

- Status: completed
- Review date: 2026-10-22

## Review Summary

The port extends existing resource targeting and guarded transactions. No new
durable architecture decision or supersession is introduced. Preserve current
origin witnesses, ordered provenance, separate replacement/recovery operations,
OpenSpec authority, and immediate human MCP approval.

## ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md`
- `adr/0002-schema-revisions-and-provenance.md`
- `adr/0003-schema-switch-and-validation.md`
- `adr/0004-portable-opentui-skills.md`
- `adr/0005-linked-worktree-schema-origin-and-repin.md`
- `adr/0006-guarded-manual-npm-release.md`
- `adr/0007-reviewed-unmanaged-skill-replacement.md`
- `adr/0008-reviewed-repin-with-unknown-historical-origin.md`

## New Durable ADRs Created

None. Only ADRs 0005 and 0008 are marked Accepted; all reviewed files remain
unchanged. Publication approval and bounded design decisions are recorded in
`journey.md`, not represented as approval of previously proposed ADRs.
