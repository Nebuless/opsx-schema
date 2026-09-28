# Design Journey

## Scope and Exclusions

- Scope: Propose a manually dispatched, dry-run-first npm release path for the existing `opsx-schema` package, incorporating two defects found in the unmerged branch's release preflight.
- Exclusions: Publishing now, auto-releasing from ordinary CI, changing required CI check names, changing the legacy `resources/CHANGELOG.md`, or enabling unverified credentials.

## Material Decisions

- The user approved merging CI/quality first and keeping npm publishing separate on 2026-09-27. Current `main` has five required protected CI checks, the package's root `CHANGELOG.md`, and conventional-changelog tooling, but no release workflow.
- The unmerged branch's check-run preflight rejects duplicate runs for a successful check after a rerun. Its changelog guard accepts a dated version heading without release notes. This change must not repeat either error.
- Retain the reviewed manual release model: operator chooses an exact version/tag, default is dry run, protected release permissions and npm trusted publishing are required, provenance is verified after publication, and the tag is created only after that verification. Publication cannot be undone, so a post-publication verification failure needs an explicit stop and manual investigation.

## Grilling Receipt

- Status: completed
- Method: grill-with-docs
- Result: Reviewing the existing branch and release script exposed duplicate-run and empty-entry gaps; the user requested them as a separate npm change after CI/quality was merged.

## Route Selection

- Branch ID: guarded-npm-publishing/v1
- Selected route: Adapt the reviewed manual workflow on top of protected `main`, fix both preflight defects, and prove dry-run and failure behavior before enabling real publication.
- Alternatives: Do not merge the old release workflow unchanged; do not switch to automatic conventional-commit publication. Sibling `pi-first-agent-delivery` owns agent delivery.

## Approval Receipts

- Discovery: User requested evaluation of CI/CD, npm publishing, and findings before creating multiple changes on 2026-09-27.
- Route selection: User approved a narrower CI-only PR and deferred npm release to a separate change on 2026-09-27.
- Direction selection: The previously reviewed manual dry-run release design is retained; user requested continuing the separated changes after local synchronization on 2026-09-28.
- Accepted loopback: Two known preflight gaps are brought forward as explicit release requirements rather than copied unchanged from the unmerged branch.
- Pre-task handoff: User authorized proposal creation, not release implementation or actual publication. A later apply request is required.

## MCP Receipt

- Approval: Not applicable; no MCP setup is part of publishing.
- Host and evidence: GitHub Actions and npm are existing intended release services; no MCP host configuration is needed.
- Config target: None.
- Catalog and result: None.
- Validation and fallback: Release design can be tested without installing MCP servers.

## Loopback History

- Initial branch reconciliation: `main` now owns CI, Qlty, commit validation, and the root changelog. The unmerged release implementation remains reference material, not an implementation already deployed here.

## Sibling Changes

- `pi-first-agent-delivery`: no dependency; links to release operation only if needed.
- `readme-positioning`: may link to install instructions but cannot claim a published version until one exists.
- Canonical scope is the new `npm-release` capability; existing CI names and package files stay in force.

## Reconciliation Receipts

- Initial discovery: read current `.github/workflows/ci.yml`, `docs/ci.md`, `package.json`, root `CHANGELOG.md`, and the unmerged branch's `.github/workflows/release.yml` and `.github/scripts/release-guard.mjs`; reviewed repository ADRs 0001 through 0004. No canonical npm release spec exists on `main`. Validate once artifacts are complete.
- Sibling reconciliation on 2026-09-28: reread this change's `journey.md`, `proposal.md`, `specs/npm-release/spec.md`, `design.md`, `adr.md`, and `tasks.md` with sibling paths and repository ADRs 0001-0006. `openspec/specs/npm-release/spec.md` is absent, as expected for a new capability. Refreshed status reports 6/6 artifacts and `openspec validate guarded-npm-publishing --type change --strict` passed. The agent sibling owns coordinator policy; the README sibling owns introductory copy. No downstream repair was needed.
