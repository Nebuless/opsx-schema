# CI and local checks

Run `bun run check` before opening a pull request. It checks formatting and lint
with Biome, runs Qlty 0.644.0, checks TypeScript, exercises the application and
packed distribution, and validates bundled resources. Qlty reports complexity
and duplication as advisory findings; they do not block a pull request. Its
configuration excludes bundled host assets, resource snapshots, and skills;
`bun run test:schemas` checks the bundled resources separately.

Use Conventional Commits for every commit, not just the pull request title.
For example, `fix(cli): preserve pinned schema`. Check a proposed subject with
`printf '%s\n' 'fix(cli): preserve pinned schema' | bun run commitlint`.
CI checks the pull request's commits from the merge base through its head.
Generate a conventional changelog preview with
`bun run changelog --release-count 0 --outfile /tmp/opsx-schema-changelog.md`.
Review and edit the root `CHANGELOG.md` for a release; the legacy history in
`resources/CHANGELOG.md` belongs to the former schema package. Generation is
not automatic and a passing commit check does not prove release notes complete.

The GitHub workflow runs on pull requests and `main` pushes with read-only
repository access. It has no npm publish step. Require a pull request and the
following exact check names in branch protection before merging:

Required CI check names:
- Commit history
- Quality
- Application tests
- Resource checks
- Package distribution smoke

Configure these protections in GitHub; files in this repository cannot enforce
them. Keep rebase merge enabled so the individual conventional commits remain
visible. A new push requires checks on the new head commit.

For the separate, manually dispatched npm release and its dry-run and
trusted-publisher setup, follow [the npm release guide](npm-release.md).
