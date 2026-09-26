## ADDED Requirements

### Requirement: Guarded bundled schema revision install
The CLI SHALL let a caller inspect an already installed bundled schema and preview installation of changed bundled content under an explicit distinct schema name. The preview SHALL disclose source revision, destination, installed target state, validation, and affected pins/default; Apply SHALL require authorization for that exact fresh plan and refuse collision, drift, or a reused target without partial writes. It SHALL NOT implicitly switch the project default or migrate active changes.

#### Scenario: Collision becomes a reviewed side-by-side install
- **GIVEN** an older bundled revision installed under its original name and a newer bundle with changed content
- **WHEN** a caller supplies a distinct available name and reviews the installation preview
- **THEN** the CLI offers an exact authorized install of the new named revision and shows that the old named schema, pins, and default are unchanged.

#### Scenario: Plan becomes stale before installation
- **GIVEN** a preview for a distinct schema destination
- **WHEN** the bundle source or destination changes before Apply
- **THEN** Apply refuses with a stale-plan diagnostic and no installed schema or default is changed.

### Requirement: CLI creation and reconciliation of pin profile selections
The CLI SHALL accept or resolve a verified, explicitly recorded named-profile, native skill-host, and skill-bundle selection when creating a change pinned to a schema declaring managed skills; it SHALL persist that per-change association and expose its provenance in diagnostic reads. When no exact selection is available, creation SHALL request an explicit selection or fail safely rather than silently create an apparently healthy unassociated pin. The CLI SHALL expose a guarded, exact-target reconciliation operation for existing unknown pins; it MUST NOT infer historical choices from files that happen to be installed.

#### Scenario: Newly created pinned change is diagnosable
- **GIVEN** a default schema with managed skills and a verified named-profile/native-host selection recorded by the prior schema switch
- **WHEN** a CLI caller creates a new pinned change and runs doctor
- **THEN** doctor resolves the change's exact profile, host, and bundle requirements without `RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN`, while any independent incomplete-artifact finding remains.

#### Scenario: Legacy pin cannot be guessed
- **GIVEN** an older pinned change with no profile association and several installed host skill sets
- **WHEN** a caller inspects doctor or previews reconciliation without an explicit profile/host selection and exact target evidence
- **THEN** doctor reports the unknown association, reconciliation is refused without mutation, and skill disable remains blocked.

### Requirement: First-class five-host schema adapter and MCP commands
The CLI SHALL expose schema workflow-adapter compatibility and installation for OpenCode, OMP, Pi, Atomic, and Senpi, using verified host-native project destinations; the OpenSpec schema itself remains host-independent. CLI resource and doctor reads SHALL separately report native skill destinations and every schema-declared MCP server's per-host config capability. The MCP preview SHALL show a target, exact config/diff, URL, permissions/auth and transport or a specific unsupported/prerequisite diagnostic. No provider entry SHALL be written without a fresh exact-plan interactive human approval; non-TTY calls MUST fail closed. The CLI SHALL not conflate a configured entry with reachable connectivity or a guided-only instruction with an installed provider.

#### Scenario: Five schema workflows are discoverable
- **GIVEN** a schema with project-scoped workflow adapters and five verified host-native destinations
- **WHEN** a caller previews and installs adapters for OpenCode, OMP, Pi, Atomic, and Senpi and inspects them through their respective hosts
- **THEN** each host discovers the same schema-backed workflows in its own command/prompt location, with collisions and unsupported formats reported before mutation; no schema identity or pin is changed by adapter installation.

#### Scenario: Two declared servers and five hosts
- **GIVEN** a schema declaring two safe servers and a project with all five verified MCP integrations
- **WHEN** a caller previews both servers for each host and uses a usable TTY to approve each exact target
- **THEN** read output identifies ten host/server entries with their actual target and configured state, and a second preview is unchanged without duplicate writes; no reachability claim is made.

#### Scenario: Host transport is not provisioned
- **GIVEN** Pi lacks its required MCP adapter or any host's native config cannot represent the declared transport
- **WHEN** a caller requests a host/server preview or noninteractive Apply
- **THEN** the CLI reports the exact missing prerequisite or unsupported transport and refuses mutation rather than returning installed or accepting an unattended approval flag.
