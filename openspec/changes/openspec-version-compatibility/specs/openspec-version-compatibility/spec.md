## ADDED Requirements

### Requirement: Supported stable OpenSpec CLI versions
The system SHALL accept stable OpenSpec 1.x releases starting at 1.12.0 for project commands, without an exact minor or patch pin.

#### Scenario: Newer compatible release
- **GIVEN** OpenSpec 1.13.2 is installed
- **WHEN** a user previews a schema switch
- **THEN** the version preflight permits the switch preview to run

### Requirement: Older and unknown versions fail before writes
The system MUST reject OpenSpec versions below 1.12.0, unsupported major releases, and unrecognized version output before installing or switching a project schema.

#### Scenario: Older release
- **GIVEN** an OpenSpec release older than 1.12.0
- **WHEN** a user requests schema installation or a switch preview
- **THEN** the operation fails without modifying the schema directory and recommends upgrading with an official OpenSpec URL

#### Scenario: Unsupported major or malformed version
- **GIVEN** an unsupported major release or unrecognized OpenSpec version output
- **WHEN** a user requests schema installation
- **THEN** the operation fails before writes with an actionable compatibility error

### Requirement: Awaited preflight failures
The system SHALL deliver a failed OpenSpec compatibility preflight as its ordinary structured CLI error, without an unhandled promise rejection stack.

#### Scenario: Rejected switch
- **GIVEN** an unsupported OpenSpec version
- **WHEN** a schema switch preview is requested
- **THEN** the CLI returns a nonzero structured compatibility error without a rejection stack
