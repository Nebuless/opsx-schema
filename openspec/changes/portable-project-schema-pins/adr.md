# ADR Review Manifest

- Status: completed; reviewed in-force public ADRs and recorded the approved ADR 0008 manual-repair clarification.
- Review date: 2026-10-11.

## Review Summary

The user approved ADR 0005 on 2026-10-07 at pre-approval SHA-256 `110a3da218eaa32abb2741543f52938ead220dc9c4a94415fa947088a604eaaa` and approved its C2 association-establishment amendment on 2026-10-07. The user authorized the isolated public-main delivery worktree and surgical port on 2026-10-09; public ADR 0005 was prepared on 2026-10-10. On 2026-10-11 the user replied “Approved” to the distinct narrow vanished-source manual-repair policy now recorded in ADR 0008. Neither this manifest nor that decision claims product implementation or C3 approval.

## In-Force Public ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md` — OpenSpec lifecycle and CLI write boundaries.
- `adr/0002-schema-revisions-and-provenance.md` — immutable references and per-change history; refined by the source-approved issue #10 direction.
- `adr/0003-schema-switch-and-validation.md` — guarded writes, validation and recovery; refined by the source-approved issue #10 direction.
- `adr/0004-portable-opentui-skills.md` — unrelated skill collection, preserved.
- `adr/0005-linked-worktree-schema-origin-and-repin.md` — accepted linked-origin and re-pin rules; reviewed intact and left unchanged. Its old-source reachability requirement is narrowed for manual repair by ADR 0008 only.
- `adr/0006-guarded-manual-npm-release.md` — release boundary, untouched.
- `adr/0007-reviewed-unmanaged-skill-replacement.md` — shared project-lock order and ownership guard, preserved.

ADRs 0001–0004 and 0006–0007 were read in the destination at `0bb39fd185625545e097088f37955b26272e0ad4`; their `Status: Proposed` fields have not been changed or represented as accepted. The subsequently accepted ADR 0005 was read in this worktree and remains byte-identical.

## New Durable ADRs Created

- `adr/0005-linked-worktree-schema-origin-and-repin.md` — public record of the previously approved 2026-10-07 decision and C2 amendment; public-port authorization recorded separately as 2026-10-09 and public record preparation as 2026-10-10.
- `adr/0008-reviewed-repin-with-unknown-historical-origin.md` — accepted 2026-10-11 manual-repair decision; supersedes only ADR 0005's old-source reachability restriction for an explicitly reviewed re-pin, preserving its other rules.
