## MODIFIED Requirements

### Requirement: Coordinated active-pin and resource writes
Any Opsx-controlled operation that creates, hands off, archives, reconciles, or migrates an active change's schema/skill association SHALL coordinate with schema switching, skill replacement, and restoration through a common project mutation lock protocol, using a compatible project-first order and acquiring the resource lock after the project lock when both are required. Replacement and restoration SHALL re-evaluate exact active-pin requirements under the held lock before touching the target, re-derive complete verified active-pin targets, and recheck authoritative pin/selection and target/ownership state at write boundaries. Incomplete pin knowledge MUST refuse destructive actions. Non-cooperating OpenSpec commands and external editors do not take this lock; observed changes SHALL cause stale or partial-state refusal at write boundaries, and the CLI SHALL report detected external drift rather than overwrite it or claim atomic exclusion. Ordinary schema switching and skill installation MUST retain their current ownership refusal and recoverable-write behavior, and a collision replacement receipt SHALL remain distinct from a schema-switch journal.

#### Scenario: Concurrent pin writer during replacement
- **GIVEN** an Opsx-controlled operation attempts to add an active skill requirement while replacement is in progress
- **WHEN** both operations contend for the coordinated locks
- **THEN** they serialize without deadlock and replacement cannot overwrite a skill that became required by the active pin.

#### Scenario: Active pin races replacement Apply
- **GIVEN** a replacement preview finds an unmanaged skill target not required by an active pin
- **WHEN** a concurrent change creation or reconciliation tries to make the same target required during replacement Apply
- **THEN** the operations serialize, the pin requirement is rechecked under the common lock, and either replacement refuses or the pin writer observes completed replacement before proceeding; no intermediate unbacked-up tree becomes an approved pin target.

#### Scenario: Existing switch journal requires recovery
- **GIVEN** schema switching has an unresolved partial-state journal
- **WHEN** a caller requests replacement of a target affected by that transaction
- **THEN** replacement refuses until recovery is inspected; it does not interpret the switch journal as proof of ownership or replace the target beneath incomplete recovery.
