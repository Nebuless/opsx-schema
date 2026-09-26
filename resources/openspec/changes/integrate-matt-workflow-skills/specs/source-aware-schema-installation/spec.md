## Purpose

Schema consumers need one repeatable command to install every declared companion skill, including skills hosted by more than one trusted source repository.

## ADDED Requirements

### Requirement: Install source-qualified skill declarations

The installer SHALL accept a `skills.txt` line containing a GitHub `owner/repository`, a tab character, and a repository-relative skill directory. For each declaration, it SHALL clone each unique source repository at most once per installer run and copy the complete declared skill directory into the target skill directory using the declaration directory basename.

#### Scenario: Schema declares skills from two sources

- **GIVEN** a manifest declares skills from `intent-driven-dev/skills` and `mattpocock/skills`
- **WHEN** the installer runs against an empty target skill directory
- **THEN** the target contains every declared skill directory with its source files intact

#### Scenario: Multiple skills share one source

- **GIVEN** a manifest declares two skills from the same source repository
- **WHEN** the installer runs
- **THEN** the source repository is cloned once and both skill directories are installed

### Requirement: Preserve legacy manifests

The installer SHALL treat a manifest line without a tab as a legacy skill name from `intent-driven-dev/skills/.agents/skills/<skill-name>`.

#### Scenario: Existing intent-driven manifest installs unchanged

- **GIVEN** a schema contains its existing bare-name `skills.txt` manifest
- **WHEN** the installer runs against an empty target skill directory
- **THEN** it installs each declared legacy skill directory

### Requirement: Protect existing local skills

The installer SHALL fail before copying when a target skill directory already exists, unless the caller supplies `--force`. It SHALL reject a declaration whose source or path is malformed or escapes its cloned repository.

#### Scenario: Target skill already exists

- **GIVEN** a declared target skill directory already exists
- **WHEN** the installer runs without `--force`
- **THEN** it exits nonzero and leaves the existing directory unchanged

#### Scenario: Explicit replacement

- **GIVEN** a declared target skill directory already exists
- **WHEN** the installer runs with `--force`
- **THEN** it replaces that directory with the complete declared skill directory

#### Scenario: Explicit replacement refuses a file target

- **GIVEN** a declared target skill path is an existing regular file
- **WHEN** the installer runs with `--force`
- **THEN** it exits nonzero and leaves the file unchanged
