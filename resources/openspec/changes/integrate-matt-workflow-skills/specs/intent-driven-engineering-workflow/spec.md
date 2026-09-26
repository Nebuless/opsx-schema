## Purpose

Feature work needs one selectable OpenSpec workflow that joins intent-driven artifacts with disciplined domain discovery, design, testing, diagnosis, and review.

## ADDED Requirements

### Requirement: Preserve the intent-driven artifact graph

The `intent-driven-engineering` schema SHALL define the artifact graph `proposal → (specs, design) → adr → tasks` and SHALL require `tasks` before apply.

#### Scenario: OpenSpec validates the schema

- **WHEN** a consumer runs `openspec schema validate intent-driven-engineering`
- **THEN** OpenSpec reports the schema as valid

#### Scenario: Planning follows dependency order

- **GIVEN** a new change uses `intent-driven-engineering`
- **WHEN** OpenSpec reports its artifact status
- **THEN** `specs` and `design` require `proposal`, `adr` requires `design`, and `tasks` requires both `specs` and `adr`

### Requirement: Guide each phase with relevant engineering disciplines

The schema SHALL direct proposal authors to establish domain terms, research unresolved external facts, and use the `grilling` decision-tree rounds for material user decisions that repository evidence cannot resolve; direct design authors to evaluate module interfaces, seams, depth, locality, and only material ADR decisions; direct task authors to organize verifiable dependency-ordered vertical slices; and direct implementers to choose tight bug diagnosis for reported defects, behavior-first tests at defined seams for new behavior, and a two-axis review before completion.

#### Scenario: Change instructions identify phase-specific disciplines

- **GIVEN** a change uses `intent-driven-engineering`
- **WHEN** an author requests instructions for proposal, design, tasks, or apply
- **THEN** the returned instructions identify the relevant installed skill names and their required outcome

### Requirement: Use current grilling discipline

The schema SHALL declare `mattpocock/skills` at `skills/productivity/grilling` and SHALL not declare `intent-driven-dev/skills/.agents/skills/grill-me`.

#### Scenario: Material planning decision needs user input

- **GIVEN** a proposal has a material decision that codebase evidence cannot settle
- **WHEN** the proposal author requests the next decision round
- **THEN** the workflow directs `grilling` to ask every unblocked design-tree question with a recommended answer

### Requirement: Exclude tracker-specific workflow assumptions

The schema SHALL not require GitHub issues, a separate issue tracker, `CONTEXT.md`, `docs/adr/`, or committing work as a condition of planning, installation, or apply completion.

#### Scenario: Local repository can use the workflow

- **GIVEN** a repository has OpenSpec and no configured issue tracker
- **WHEN** it installs and selects `intent-driven-engineering`
- **THEN** it can create and apply a change without tracker setup

### Requirement: Define validation and review completion

The apply instructions SHALL require targeted behavioral verification, `openspec validate <change> --type change --strict` when a change has behavior specs, `openspec schema validate intent-driven-engineering` when the schema itself changes, and a review against the change artifacts and repository standards before all tasks are marked complete.

#### Scenario: Schema modification includes OpenSpec verification

- **GIVEN** an `intent-driven-engineering` change modifies its schema files
- **WHEN** its task list is generated
- **THEN** the task list includes `openspec schema validate intent-driven-engineering` as completion evidence
