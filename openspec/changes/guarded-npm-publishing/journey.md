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
- Registry visibility correction on 2026-09-28: release run `36478323177` published `0.1.1`, then immediate registry lookup failed while npm processed the version. Later read-only installation, signature audit, and exact-source provenance verification passed. User authorized planning and implementation of a bounded visibility wait; publication remains single-shot and tag recovery stays separate. Plan uses native GNU timeout, retries only missing-version reads, and preserves all cryptographic gates.
- Correction verification on 2026-09-28: focused release/CI tests passed (35 tests). The actual updated verification shell passed read-only against published `0.1.1` with npm `11.5.1`; signature audit returned empty `invalid` and `missing` arrays and Sigstore verification produced a temporary marker for exact SHA `7f3daf21c6e083080864af17fae5f06c1f9984bd`. Temporary files were removed; no publication or tag recovery ran. Formatting, lint, Qlty, TypeScript, 161 application tests, packed distribution smoke, resource checks, and all nine schema validations passed in `bun run check` output. The tool wrapper reported a timeout despite complete passing output and supplied no numeric exit status; this is not recorded as a clean aggregate command exit. Strict change validation passed. Release guide and unreleased changelog now document the bounded read wait.
- Independent correction review on 2026-09-28: `ReleaseReviewFallback` returned PASS with no blocking defects after reviewing timeout propagation, E404-only retry behavior, exact-version validation, strict signature/provenance/tag authorization, and fixture isolation. Specialized reviewer launches failed before review with `No model selected`; their attempts are not review evidence. No commit, push, publication, or tag recovery occurred during this correction.

## Sibling Changes

- `pi-first-agent-delivery`: no dependency; links to release operation only if needed.
- `readme-positioning`: may link to install instructions but cannot claim a published version until one exists.
- Canonical scope is the new `npm-release` capability; existing CI names and package files stay in force.

## Reconciliation Receipts

- Initial discovery: read current `.github/workflows/ci.yml`, `docs/ci.md`, `package.json`, root `CHANGELOG.md`, and the unmerged branch's `.github/workflows/release.yml` and `.github/scripts/release-guard.mjs`; reviewed repository ADRs 0001 through 0004. No canonical npm release spec exists on `main`. Validate once artifacts are complete.
- Sibling reconciliation on 2026-09-28: reread this change's `journey.md`, `proposal.md`, `specs/npm-release/spec.md`, `design.md`, `adr.md`, and `tasks.md` with sibling paths and repository ADRs 0001-0006. `openspec/specs/npm-release/spec.md` is absent, as expected for a new capability. Refreshed status reports 6/6 artifacts and `openspec validate guarded-npm-publishing --type change --strict` passed. The agent sibling owns coordinator policy; the README sibling owns introductory copy. No downstream repair was needed.
