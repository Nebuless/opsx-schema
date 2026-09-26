## MODIFIED Requirements

### Requirement: Distinct skill-host selection with verified destinations
Settings SHALL expose OpenCode, OMP, Pi, Atomic, and Senpi as selectable native skill-install hosts distinct from optional named agent profiles and schema selection. Each host's project destination and actual discoverability SHALL be verified against its host contract before a mutating preview is ready; unsupported, missing, conflicting or shared targets SHALL be identified rather than guessed. A selection alone SHALL NOT write a file. Existing optional named profiles, including Gemini, Codex, and Claude, SHALL NOT be presented as substitutes for the five native hosts.

#### Scenario: Stage real host targets
- **GIVEN** a schema declaring a managed skill and verified native skill roots for OpenCode, OMP, Pi, Atomic, and Senpi
- **WHEN** the user stages each host and opens the preview
- **THEN** five labeled destinations with the actual skill effects appear independently of named profiles, and no target is written before review and confirmation.

#### Scenario: Host cannot be resolved safely
- **GIVEN** Pi or Senpi has an unverified discovery path, or two selected host IDs resolve to the same physical target
- **WHEN** the user previews skill installation
- **THEN** Settings identifies the host, destination, and reason, does not claim an installed target, avoids duplicate physical writes, and refuses unsafe installation without altering other targets.

### Requirement: Exact-effect review and per-target outcome
Before applying staged host effects, Settings SHALL show the resolved operation and destination for each selected host alongside schema, named-profile and migration effects, require the existing confirmation, and distinguish verified applied, unchanged, blocked and recovery-needed results per target. The result SHALL NOT infer completion from an accepted confirmation or staged checkbox. A provider installation remains a separate per-server, per-host interactive human approval with exact URL, target, permissions and config diff; a skill-host confirmation SHALL NOT approve an MCP provider.

#### Scenario: Review and confirm host effects
- **GIVEN** a user staged a schema and skill targets for OpenCode, OMP, Pi, Atomic, and Senpi
- **WHEN** the user opens preview then proceeds to confirmation
- **THEN** the review names the exact skill artifacts and destinations for all five hosts, distinguishes those from named profiles and migration effects, and canceling leaves every target unchanged.

#### Scenario: An Apply does not fully finish
- **GIVEN** a confirmed switch applied skills for OpenCode and OMP but an unresolved Pi skill destination or Senpi collision blocked another target
- **WHEN** the result screen appears or the user reopens Settings
- **THEN** each host reports its observed outcome and recovery action, the overall operation is not labeled fully applied, and the project default does not point at incompletely prepared required resources.

#### Scenario: Provider installation remains independent
- **GIVEN** five skill hosts were selected and the schema also declares MCP servers
- **WHEN** the user reviews skills or separately opens a server installation preview
- **THEN** the skill approval does not authorize any provider and each provider install still requires immediate human review of its host-specific exact effects.
