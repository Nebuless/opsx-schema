## ADDED Requirements

### Requirement: Distinct skill-host selection with verified destinations
Settings SHALL expose OMP and Atomic as selectable skill-install hosts distinct from agent-profile and schema selections. The selected host's destination and discoverability SHALL be verified against its host contract before a mutating preview is considered ready; unsupported, missing or shared targets SHALL be identified rather than guessed. A selection alone SHALL NOT write any file.

#### Scenario: Stage real host targets
- **GIVEN** OMP and Atomic are available as skill hosts and a schema is selected
- **WHEN** the user selects OMP or Atomic and inspects staged choices
- **THEN** each host is labeled as a skill-install target, its verified destination and expected skill effects are shown, and no installation occurs before review and confirmation

#### Scenario: Host cannot be resolved safely
- **GIVEN** a target lacks a verified writable destination, has an ownership collision or aliases another selected host destination
- **WHEN** the user stages it
- **THEN** Settings identifies that target and reason, avoids double-writing shared content and blocks unsafe installation instead of reporting success

### Requirement: Exact-effect review and per-target outcome
Before applying staged host effects, Settings SHALL show the resolved operation and destination for each selected target alongside schema, profile and migration effects, require the existing confirmation, then distinguish verified applied, unchanged, blocked and recovery-needed outcomes per target. The result SHALL not infer completion from accepted confirmation or from a staged checkbox.

#### Scenario: Review and confirm host effects
- **GIVEN** a user staged a schema, an OMP skill target and an Atomic skill target
- **WHEN** the user opens preview then proceeds to confirmation
- **THEN** the review names the exact skill artifacts and destinations for both hosts, distinguishes those from profile choices and migration effects, and canceling leaves all targets unchanged

#### Scenario: An Apply does not fully finish
- **GIVEN** a confirmed Apply completed for one target but another target failed, was blocked or requires recovery
- **WHEN** the result screen appears or the user reopens Settings
- **THEN** each target reports only its observed outcome and actionable recovery information; the overall operation is not labeled fully applied

#### Scenario: Provider installation remains independent
- **GIVEN** a schema skill host is selected and the schema also declares optional MCP servers
- **WHEN** the user reviews skill-host effects or provider installation
- **THEN** skill-host confirmation cannot approve a provider, and the provider flow still requires its own interactive provider-safety approval with URL, target, permissions and diff
