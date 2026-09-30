## MODIFIED Requirements

### Requirement: Historical provenance and component-specific verification
Aggregate verification SHALL preserve a nonzero result when an older active change's exact historical schema revision is unknown. It SHALL identify the failing change, `PROVENANCE_UNKNOWN`, and the artifact or missing evidence responsible without converting the warning-level finding into overall success. Text and JSON output SHALL distinguish validation against a currently resolved schema from proof of that change's creation revision, and SHALL report schema validation and managed-skill integrity as separate outcomes. Command-adapter inspection SHALL remain a separate check, not a falsely passing aggregate component. Reviewed `skills reconcile` MAY record an exact current revision and explicit skill selection where provable, but MUST NOT invent creation history; `created: null` / Unknown history remains unknown. Missing or drifted revision and unproven selection MUST continue to block reconciliation. The CLI SHALL document reviewed reconciliation of an exact pinned revision and skill selection where provable while retaining unknown creation history; it SHALL NOT guess provenance from currently installed assets or mutate a legacy change merely to pass verification.

#### Scenario: Unknown old change beside intact installation
- **GIVEN** the installed schema and managed skills are intact but an older active change has unknown historical provenance
- **WHEN** aggregate verification runs in text or JSON mode
- **THEN** it identifies the failed active-change component, keeps exit status nonzero, reports intact checks separately, and does not label installation corrupt or the historical revision proven.
- **AND** it identifies the change and missing provenance evidence, and distinguishes current-schema validation from proof of historical origin.

#### Scenario: Exact current pin can be reconciled
- **GIVEN** an older change has unknown creation history but its current retained pin and explicit skill association can be independently reviewed
- **WHEN** a caller reconciles the exact current revision and selection
- **THEN** later diagnostics may report those current facts while preserving unknown historical creation identity and refusing missing or drifted revisions.

#### Scenario: Diagnostics identify missing historical evidence
- **GIVEN** an older active change lacks evidence for its exact creation revision
- **WHEN** aggregate verification reports `PROVENANCE_UNKNOWN`
- **THEN** text and JSON diagnostics identify the change and missing evidence, and distinguish current-schema validation from proof of historical origin.
