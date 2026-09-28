## ADDED Requirements

### Requirement: Manual dry-run-first release
The release workflow SHALL start only on an operator's manual request for an exact package version and matching tag, SHALL default to dry run, and SHALL not publish or tag during a dry run.

#### Scenario: Operator leaves the dry-run default
- **GIVEN** a version and its matching `v`-prefixed tag
- **WHEN** the operator runs the release workflow without enabling publication
- **THEN** preflight checks run and no npm version, Git tag, or GitHub Release is created

### Requirement: Current protected commit and checks
The release workflow SHALL require that its commit is the current tip of protected `main` and that each of the five required CI checks has an authoritative completed success for that exact commit. Older duplicate attempts SHALL NOT by themselves block a successful latest attempt; a newer failed or incomplete attempt SHALL block release.

#### Scenario: Successful required check was rerun
- **GIVEN** the release commit has an older and a newer run of one required check
- **WHEN** the newer authoritative run succeeded and all other required checks succeeded
- **THEN** the extra historical run does not fail preflight

#### Scenario: Latest required check failed
- **GIVEN** a required check has a successful older run but a newer failed or incomplete run for the release commit
- **WHEN** preflight evaluates the checks
- **THEN** it rejects the release

### Requirement: Release metadata and content are complete
Preflight SHALL require the requested version, package version, and tag to match; the tag and npm version to be unused; a dated matching root changelog section to contain at least one substantive release note; and the packed package to contain the required runtime resources without forbidden project history.

#### Scenario: Changelog has only a version heading
- **GIVEN** a matching dated version heading in root `CHANGELOG.md` with no release note before the next heading
- **WHEN** preflight validates the release
- **THEN** it rejects publication with an actionable changelog error

### Requirement: Protected trusted publication
Real publication SHALL require the configured protected GitHub release environment and npm trusted publisher, SHALL publish only once with provenance, and SHALL verify the published version and generated provenance before tagging the published commit. After successful publication, only exact-version registry reads reporting npm `E404` MAY be retried for up to five minutes. Other registry errors, incorrect version output, visibility timeout, or signature/provenance failures SHALL stop without another publication or tag and report the published version for manual investigation.

#### Scenario: Registry processes a successful publication
- **GIVEN** npm accepted a publication but its exact version lookup initially reports `E404`
- **WHEN** the version becomes visible within the five-minute window
- **THEN** verification continues with the exact version and strict signature/provenance checks, without another publication

#### Scenario: Registry visibility does not recover
- **GIVEN** npm accepted a publication but exact-version reads remain missing through the deadline or return another error
- **WHEN** the visibility wait fails
- **THEN** no installation, verification marker, tag, or second publish occurs, and the operator is told to investigate the published version

#### Scenario: Provenance verification fails after publication
- **GIVEN** npm accepted a publication but provenance verification did not pass
- **WHEN** the workflow reaches tagging
- **THEN** no tag or second publish occurs, and the operator is told to investigate the published version
