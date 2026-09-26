# opentui-skill-collection Specification

## Purpose
Defines portable Agent Skills routing and rendered-interaction proof for building OpenTUI applications with the appropriate framework and components.

## Requirements

### Requirement: Portable skill routing
The collection SHALL expose Agent Skills-compatible entries for OpenTUI design, official framework selection, component selection, optional termcn and tuiparts use, and verification.

#### Scenario: User requests a terminal application
- **GIVEN** a user brief for an OpenTUI application
- **WHEN** an agent activates the collection
- **THEN** it can select Core, React, or Solid and load only relevant references without treating third-party components as built-ins

### Requirement: Design and proof
The design skill SHALL direct the agent to inspect terminal-sized output and exercise important interactions before asserting completion.

#### Scenario: Responsive interactive view
- **GIVEN** a view with narrow and wide layouts and keyboard input
- **WHEN** the agent completes implementation
- **THEN** its workflow requires rendered-frame review, focus/input checks, and cleanup evidence
