## ADDED Requirements

### Requirement: Effective-schema validation
The application SHALL validate a change against its own resolved pinned schema, not merely the current project default. The gate SHALL report revision availability/drift, artifact and workflow shape, readiness and strict OpenSpec validation findings without treating installed skills as an execution allowlist.

#### Scenario: Two schemas in one project
- **GIVEN** the project default is `design-v2` while an active change remains pinned to `general-v1`
- **WHEN** validation runs for the old change
- **THEN** its artifacts and workflow are checked under `general-v1`, and skill installation under `design-v2` does not make an invalid old artifact valid.

#### Scenario: Missing pinned revision
- **GIVEN** a change pinned to a schema revision whose retained content is missing or drifted
- **WHEN** a CLI mutation or validation is requested
- **THEN** the mutation is refused and the validation result identifies the missing or changed revision rather than silently using a same-name replacement.

### Requirement: Mutation and external-edit checks
Opsx lifecycle mutations SHALL run the relevant validation gate before changing state, and the same read-only check SHALL be usable from hooks/CI to detect external artifact edits. Validation MUST distinguish failures from unknown/unreadable inputs and MUST NOT claim that arbitrary agent actions or retained skill invocation are prevented outside its controlled path.

#### Scenario: External artifact edit
- **GIVEN** an external editor changed a required artifact into a form that violates its pinned schema
- **WHEN** the read-only gate is run from CI
- **THEN** it reports a failing change with the specific artifact and reason without rewriting the artifact.

#### Scenario: Inactive installed skill
- **GIVEN** a retained skill is installed but not active for the selected change's schema
- **WHEN** artifact/workflow validation succeeds
- **THEN** the result reports the artifact/workflow validity without claiming the agent was technically blocked from invoking that skill.

## Next Handoff

`openspec instructions design --change "build-opsx-schema-application" --json`
