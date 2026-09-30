# workflow-validation Specification

## Purpose
Validates changes against their effective pinned schemas and checks safety when project files change.

## Requirements

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

### Requirement: Historical provenance and component-specific verification
Aggregate verification SHALL preserve a nonzero result when an older active change's exact historical schema revision is unknown. It SHALL identify the failing change, `PROVENANCE_UNKNOWN`, and the artifact or missing evidence responsible without converting the warning-level finding into overall success. Text and JSON output SHALL distinguish validation against a currently resolved schema from proof of that change's creation revision, and SHALL report schema validation and managed-skill integrity as separate outcomes. Command-adapter inspection SHALL remain a separate check, not a falsely passing aggregate component. Reviewed `skills reconcile` MAY record an exact current revision and explicit skill selection where provable, but MUST NOT invent creation history; `created: null` / Unknown history remains unknown. Missing or drifted revision and unproven selection MUST continue to block reconciliation.

#### Scenario: Unknown old change beside intact installation
- **GIVEN** the installed schema and managed skills are intact but an older active change has unknown historical provenance
- **WHEN** aggregate verification runs in text or JSON mode
- **THEN** it identifies the failed active-change component, keeps exit status nonzero, reports intact checks separately, and does not label installation corrupt or the historical revision proven.

#### Scenario: Exact current pin can be reconciled
- **GIVEN** an older change has unknown creation history but its current retained pin and explicit skill association can be independently reviewed
- **WHEN** a caller reconciles the exact current revision and selection
- **THEN** later diagnostics may report those current facts while preserving unknown historical creation identity and refusing missing or drifted revisions.

