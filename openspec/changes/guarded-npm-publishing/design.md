## Context

`main` contains `.github/workflows/ci.yml`, `docs/ci.md`, Conventional Commit tooling, and a root package `CHANGELOG.md`. It has no tracked release workflow. The old branch's workflow provides a manual dry-run-first sequence but counts exactly five check-run objects, so reruns fail, and its guard checks only for a changelog heading. ADR 0001 defines the package's OpenSpec boundary; repository ADRs 0002-0004 do not decide npm release operations.

## Goals / Non-Goals

**Goals:**

- Reuse current branch protection and five named required checks for an exact release SHA without rejecting valid check reruns.
- Reject missing or empty notes in a dated root version section, along with mismatched version/tag, existing tag or npm version, missing packed runtime resources, and unconfigured trusted publishing.
- Keep dry runs non-publishing and real publication limited to an explicitly authorized environment; verify the package and provenance before tagging.

**Non-Goals:**

- Automatic release from a commit, a GitHub Release, changing CI names, or actually publishing during this change.

## Selected Direction

Adapt the unmerged `.github/workflows/release.yml` and `.github/scripts/release-guard.mjs` rather than merging them verbatim. Put check selection in a focused, testable guard: fetch checks for the exact commit, restrict to the trusted CI workflow/check source, resolve each required name to its most recent authoritative attempt by run identity and start time (with deterministic tie-breaking), and require completed success for all five. Reject missing, failed, cancelled, or in-progress latest attempts; do not require the raw result list length to equal five. Recheck the current protected `main` tip immediately before publication so preflight is not used after the branch advances.

Parse root `CHANGELOG.md` into version sections using exact version and ISO-date headings. Require non-whitespace, non-placeholder release-note content in the target section before the next version heading; prose headings alone and an empty bullet do not count. Do not equate commit history or changelog generation with reviewed release notes. Preserve packed-file validation and the distribution smoke test from existing project scripts.

The manual workflow has a default dry-run preflight job with read-only permissions; a separate publish job is limited to the protected `npm-release` environment and `id-token: write`. Use npm trusted publishing and provenance, publish once, verify the registry version and signature/provenance, and then tag the exact SHA. On verification failure, report the already-published version and stop without retry or tag. Deployment documentation states the GitHub environment and npm trusted publisher must be configured and independently checked before a real run.

## Implementation Guardrails

- Keep the five names in `docs/ci.md` authoritative. Treat unexpected or untrusted same-name checks as irrelevant, not as proof; test duplicates and latest failure.
- Existing `resources/CHANGELOG.md` belongs to the former schema collection; only root `CHANGELOG.md` supplies package notes.
- Dry-run never requests an OIDC publish token, npm publication, or tag write. Never give credentials to PR CI.
- Verify the registry's preexisting-version response distinctly from network/auth failure; an unavailable registry is not proof that a version is free.
- Pin Actions and package tool versions as current CI does; avoid depending on mutable tags for release authority.

## Alternatives Considered

- Merge old release workflow unchanged: rejected by duplicate-run and heading-only false positives.
- Auto-publish from Conventional Commits: rejected because the reviewed release route includes an explicit human release decision and manual notes.
- Tag before publication or retry on provenance failure: rejected because tag would imply unverified provenance and npm versions cannot be unpublished reliably.

## Risks / Trade-offs

- Check-run ordering and workflow identity need correct GitHub API pagination and test fixtures. Failure must be explicit rather than silently trusting an arbitrary same-name status.
- A dry run cannot prove that npm trusted-publisher permissions will work on a future real publish. Administrative configuration and a protected release environment remain external prerequisites.
- npm provenance is created after publication. If verification fails, the published version remains; stop, withhold the tag, and investigate rather than attempting an automatic second publish.

## Migration Plan

1. Add a guarded workflow and tested release helper against the current main CI names; run YAML, duplicate-check, changelog, package, and failure-path contract tests.
2. Run the dry-run workflow on a reviewed protected `main` commit with no publication or tag.
3. An administrator configures GitHub's protected `npm-release` environment and npm trusted publisher separately and verifies readiness before permitting a real run.
4. For a real version, merge version and substantive notes via PR before dispatch. If preflight fails, fix via a new PR; if publication succeeds but verification fails, stop without tag and investigate.

## Open Questions

- The exact first live release date and operator are operational choices for the eventual publish, not prerequisites for planning or dry-run verification.

## Post-publication Registry Visibility Correction

### Goal and Constraints

Release run `36478323177` published `0.1.1` from `7f3daf21c6e083080864af17fae5f06c1f9984bd`, then failed on an immediate registry `E404` while npm processed the package. Subsequent read-only installation, signature audit, and exact-source provenance verification passed. Correct future verification without republishing `0.1.1`, recovering its tag, changing credentials, or weakening provenance checks.

### Selected Implementation

1. U1: Replace the immediate `npm view` in `.github/workflows/release.yml` with a read-only loop bounded by GNU `timeout --kill-after=5s 5m`. Retry only the exact npm `E404` code line, sleep five seconds between reads, and disable npm's own fetch retries with a ten-second request timeout. Query the exact version with fresh registry metadata. Reuse `assertPublishedVersion` from `.github/scripts/release-guard.mjs` before installation; wrong or malformed version output fails without retry. No new dependency or configurable retry framework.
2. U2: Exercise the actual workflow verification shell in `test/workflow/release-contract.test.ts` with controlled npm responses and a shortened native timeout for deterministic deadline coverage. Prove delayed visibility succeeds, permanent invisibility stops, unrelated registry errors fail immediately, and incorrect versions cannot proceed. Preserve existing signature/provenance rejection tests and one-shot publication policy.
3. U3: Update `docs/npm-release.md` and root `CHANGELOG.md` after smoke verification. Document the five-minute visibility window, terminal failures, and manual investigation without republishing or automatic tag recovery.

### Verification and Completion

- Run the delayed-visibility regression before changing the workflow, then repeat after the fix.
- Run focused release and CI tests, `bun run check`, and strict OpenSpec change validation.
- Smoke the real workflow shell against controlled delayed registry responses, then run read-only verification of published `0.1.1` using npm `11.5.1` and the existing Sigstore guard against its published source SHA. Never invoke publish or tag.
- Complete when all correction cases pass, strict verification remains intact, and operating docs match observed behavior. Existing task 3.2's protected-main dry-run handoff is not evidence for this local correction.

### Risks and Alternatives

GNU timeout is available on the workflow's Ubuntu runner; its five-second kill grace bounds a hung child after the five-minute deadline. Registry visibility does not prove signatures or provenance, so the subsequent install, audit, bundle verification, and exclusive marker creation remain mandatory. Retry only missing-version reads, not authentication/network errors, signature failures, publication, or tagging. An arbitrary fixed delay wastes time and still races; broad retries hide unrelated failures.
