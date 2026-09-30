## MODIFIED Requirements

### Requirement: Declared-bundle diagnostics and pre-install discovery
The CLI SHALL distinguish an undeclared skill bundle from an undeclared named agent profile. Bundle-selection errors MUST identify the selected schema and its actually declared tiers, indicate when `default` contains all declared skills, and leave selection unchanged; CLI JSON errors and blocked previews SHALL remain nonzero. Read-only skill inspection SHALL continue to report available and unavailable tiers without treating a requested unavailable tier as install authorization. When a known bundled schema is not yet resolvable as a project schema, project-scoped skill inspection SHALL identify bundled discovery and the guarded named install path without silently inspecting a same-name bundled source or masking unrelated OpenSpec failures.

#### Scenario: Bundle and named-profile errors are distinct
- **GIVEN** `compound-intent-driven` declares 11 skills in `default` and does not declare `recommended` or `all`
- **WHEN** a caller inspects tiers or attempts to install `all`, and separately supplies an unknown named profile
- **THEN** inspection reports the actual tier availability, bundle refusal names the available tier without substituting it, and the unknown profile retains its named-profile diagnostic.

#### Scenario: Compound `all` is not declared
- **GIVEN** installed `compound-intent-driven` declares 11 skills in `default` and no `all` or `recommended` tier
- **WHEN** a caller inspects the bundle catalog and requests `--bundle all` for skill installation or schema switching
- **THEN** inspection reports `default` available with 11 declarations and `all` unavailable, while the mutation refuses with a skill-bundle diagnostic naming `default` as supported and does not substitute it.

#### Scenario: Missing project schema is a bundled catalog entry
- **GIVEN** a project lacks a schema name that exists in the bundled catalog
- **WHEN** project-scoped `skills inspect` requests that name
- **THEN** the nonzero result retains project-resolution failure and gives bundled discovery and named-install guidance without pretending the bundle is installed.

#### Scenario: Unrelated OpenSpec resolution error
- **GIVEN** project schema resolution fails for a reason other than a known missing bundled schema name
- **WHEN** skill inspection runs
- **THEN** the original resolution failure remains visible without a bundled install suggestion.

### Requirement: Accurate bundled installation grammar and distinct mutation stages
Help and command documentation SHALL identify the `schemas install` argument as a bundled schema name rather than a filesystem path, use one global `--project` option per invocation, and distinguish schema installation, skill selection/replacement, schema activation, and host command-adapter installation. Each mutation MUST have its own exact preview and fresh apply token; the parser SHALL retain its accepted placement for a single project option and reject duplicate options or filesystem paths as bundled names.

#### Scenario: Catalog name versus source directory
- **GIVEN** a packaged schema has a catalog name and a source directory
- **WHEN** a caller installs first by name and then by directory path
- **THEN** the named request reaches the guarded preview while the path is rejected as a non-name without copying files.

#### Scenario: Separate preview tokens
- **GIVEN** a caller installs a schema, replaces a skill collision, activates a schema, and installs adapters
- **WHEN** the caller applies each reviewed operation
- **THEN** each operation requires its own fresh token and no earlier token authorizes another stage.

## ADDED Requirements

### Requirement: Explicit recovery and verification component reporting
The CLI and OMP usage guide SHALL distinguish a failed active-change provenance check from installed schema/skill integrity, and SHALL identify adapter inspection separately from aggregate `verify`. A guarded skill replacement SHALL not make an aggregate verification check claim historical change creation provenance or installed command adapters. The OMP guide SHALL provide the safe sequence, including bundled catalog, schema install, skill bundle inspection, guarded collision review, fresh switch preview/Apply, separate adapter preview/Apply, and distinct status, validation, skill doctor, adapter and supported native OMP discovery checks.

#### Scenario: Legacy change beside successful new installation
- **GIVEN** new OMP skills and adapters inspect intact but an older active change has unknown historical provenance
- **WHEN** aggregate verification reports failure
- **THEN** callers can identify the failing active-change component, the separately passing installation checks, and the independently inspected adapters without treating the installation as corrupt or the legacy change as historically proven.
