## 1. Correct release preflight

- [x] 1.1 Add a focused helper in `.github/scripts/release-guard.mjs` that evaluates the five named trusted CI checks for the exact current protected `main` SHA, accepts duplicate historical attempts when the latest authoritative attempt succeeds, and rejects missing, failed, or in-progress latest attempts. Proof: tests with duplicated, out-of-order, untrusted same-name, and paginated check runs.
- [x] 1.2 Validate exact version/tag/package match, unused tag and registry version, substantive dated root `CHANGELOG.md` notes, packed resource inventory, and distribution smoke behavior. Proof: focused cases for empty section, headings-only or placeholder notes, mismatches, registry outage, and valid release entry.

## 2. Protected manual publication

- [x] 2.1 Add `.github/workflows/release.yml` with manual inputs and dry-run default, read-only preflight, and a separate `npm-release` protected environment job with limited publication permissions and npm trusted publishing. Proof: YAML/contract tests show a dry run cannot publish or tag, and PR CI still has no release credentials.
- [x] 2.2 Publish once with provenance, verify the registered package and signature/provenance, then tag only the verified exact commit; a post-publication failure must report the version and withhold both retry and tag. Proof: failure-path tests and contract tests for publish/verify/tag order.

## 3. Release readiness and documentation

- [x] 3.1 Document the version-and-notes PR, release dry run, external GitHub environment and npm trusted-publisher setup, and manual investigation after partial success, without claiming the setup is already active. Proof: review `docs/ci.md` and release guide links against the workflow and actual check names.
- [ ] 3.2 Run focused release and CI tests, `bun run check` with OpenSpec 1.12.0, `git diff --check`, and `openspec validate guarded-npm-publishing --type change --strict`. On a protected commit, exercise the real workflow's dry-run mode with no tag or publication; do not initiate a live publish as part of this change.

## Next Handoff

Local tests, the full check, and strict validation passed. Task 3.2 remains open until a reviewed protected `main` commit with an unused version and substantive notes can run the real release workflow in dry-run mode. A real publication needs separate operator action and verified external setup.
