# Manual npm release

The release workflow is `.github/workflows/release.yml`. It is manually dispatched and defaults to `dry_run: true`. It does not run from pull requests or ordinary CI. The five required protected-branch checks are listed in [CI and local checks](ci.md); this guide does not replace that list.

## Prepare the source commit

1. Open a normal PR that changes the root `package.json` to an unused exact version and adds a dated section with substantive notes to root `CHANGELOG.md`. Review the packed contents and run `bun run check`. Do not use the legacy `resources/CHANGELOG.md` as the package release record.
2. Merge the version-and-notes PR through protected `main`. Wait for its current tip to pass all five required checks. A previous commit's passing checks do not authorize this release. The release workflow also checks that `main` is protected, the dispatch commit is still its tip, the matching `v<version>` tag and npm version are unused, and the packed runtime files and distribution smoke test pass.
3. In GitHub Actions, manually run **Release** from `main` with that exact `expected_version` and matching `tag`. Leave `dry_run` at its default `true`. Inspect the preflight result and confirm that no npm version or Git tag was created. A dry run uses read-only permissions and does not prove that future npm publishing credentials will work.

## Configure publication separately

Before the first real run, an administrator must configure the GitHub environment named `npm-release` with required reviewers and deployment restricted to protected `main`. In npm, configure trusted publishing for package `opsx-schema` from repository `Nebuless/opsx-schema` and workflow `release.yml`. Verify those settings outside this repository. Set the GitHub environment variable `NPM_TRUSTED_PUBLISHER_READY=true` only after that verification. Repository files do not create or prove these external settings. Do not add an npm token to ordinary CI or this workflow.

For a reviewed, unused version, explicitly set `dry_run: false` on a new manual dispatch from the current protected `main`. The publish job requires the protected environment, rechecks the current commit and version vacancy, and receives OIDC publication permission only there. It publishes once with provenance, waits for the exact version to become visible, installs that version and runs `npm audit signatures`, then verifies the exact registry attestation bundles with Sigstore against the npm signing keys and trust root before matching their signed claims to the workflow and source commit. Only after verification does it push the matching tag. It does not create a GitHub Release.

After npm accepts publication, registry processing can briefly return `E404` for the new version. The workflow retries only that read every five seconds for up to five minutes, with a five-second kill grace for a hung process. Each npm request disables built-in retries and uses a ten-second fetch timeout. Authentication/network errors, malformed or mismatched version output, and signature/provenance failures stop immediately; registry visibility alone never authorizes a tag. The wait never repeats `npm publish`.

If npm accepted publication but verification or tagging fails, the version may already exist without a tag. Do not rerun the workflow or tag it automatically. Record the published version, inspect npm's package and provenance records and the failed GitHub Actions run, and resolve the partial state manually before planning another release.
