# project-and-agent-cli Specification

## Purpose
Defines interactive and noninteractive entry points for project inspection and OpenSpec-backed lifecycle operations with guarded writes.

## Requirements

### Requirement: Contextual entry and useful defaults
The application SHALL open the single resolved project's dashboard for bare invocation on a usable TTY and SHALL avoid interactive rendering or hidden prompts in non-TTY use. Read commands SHALL use the nearest OpenSpec project unless an explicit project is selected, provide live help with examples, and refuse ambiguous targets instead of guessing.

#### Scenario: Bare terminal entry
- **GIVEN** an initialized OpenSpec project and a usable terminal
- **WHEN** a person invokes `opsx-schema` without arguments
- **THEN** the application opens that project's dashboard without requiring a project flag.

#### Scenario: Piped entry and ambiguous mutation
- **GIVEN** non-TTY output and two eligible active changes
- **WHEN** a caller invokes a command without an explicit mutation target
- **THEN** no renderer or prompt starts, no change is mutated, and the response gives usable help or exact target choices.

### Requirement: Common read contract
Project, change, schema, resource, diagnostic, and archive reads SHALL have compact agent-oriented output and a `--json` form that represents the same facts in one versioned structured response. Errors MUST use a nonzero exit code and actionable diagnostics without polluting machine-readable stdout.

#### Scenario: Structured project inspection
- **GIVEN** a project with a pinned active change and an archived change
- **WHEN** an agent requests the project snapshot in compact and JSON forms
- **THEN** both identify the same default schema, active change state and archive record, and the JSON form is one parseable versioned response.

#### Scenario: Unsupported environment
- **GIVEN** an OpenSpec CLI version outside the application's tested compatibility range
- **WHEN** an agent requests a lifecycle action
- **THEN** the application refuses without mutation and reports the required version or capability.

### Requirement: OpenSpec-backed lifecycle and guarded writes
The CLI SHALL expose creation, status, artifact instructions, strict validation, archive and change-schema handoff through OpenSpec's authoritative lifecycle behavior. Mutations MUST name exact targets, disclose a preview, require explicit authorization, recheck source freshness, and refuse stale plans. Schema/resource diagnostics and installation capabilities present in the sibling package SHALL have an accounted new CLI operation or OpenSpec delegation without preserving legacy syntax.

#### Scenario: Stale archive preview
- **GIVEN** an agent has previewed an archive action for one change
- **WHEN** the change files or status differ at Apply time
- **THEN** the archive is refused with a stale-plan diagnostic and no success claim.

#### Scenario: Source capability inventory
- **GIVEN** the sibling package's schema installer, diagnostics, skills, MCP catalog, handoff and viewer capabilities
- **WHEN** the new command reference and parity matrix are inspected
- **THEN** each capability has a corresponding behavior or delegated OpenSpec operation, with no unreviewed omission or required legacy alias.

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

### Requirement: Declared-bundle diagnostics and pre-install discovery
The CLI SHALL distinguish an undeclared skill bundle from an undeclared named agent profile. Bundle-selection errors MUST identify the selected schema and its actually declared tiers, indicate when `default` contains all declared skills, and leave selection unchanged; CLI JSON errors and blocked previews SHALL remain nonzero. Read-only skill inspection SHALL continue to report available and unavailable tiers without treating a requested unavailable tier as install authorization. When a known bundled schema is not yet resolvable as a project schema, project-scoped skill inspection SHALL identify bundled discovery and the guarded named install path without silently inspecting a same-name bundled source or masking unrelated OpenSpec failures.

#### Scenario: Bundle and named-profile errors are distinct
- **GIVEN** `compound-intent-driven` declares 11 skills in `default` and does not declare `recommended` or `all`
- **WHEN** a caller inspects tiers or attempts to install `all`, and separately supplies an unknown named profile
- **THEN** inspection reports the actual tier availability, bundle refusal names the available tier without substituting it, and the unknown profile retains its named-profile diagnostic.

#### Scenario: Missing project schema is a bundled catalog entry
- **GIVEN** a project lacks a schema name that exists in the bundled catalog
- **WHEN** project-scoped `skills inspect` requests that name
- **THEN** the nonzero result retains project-resolution failure and gives bundled discovery and named-install guidance without pretending the bundle is installed.

#### Scenario: Unrelated OpenSpec resolution error
- **GIVEN** project schema resolution fails for a reason other than a known missing bundled schema name
- **WHEN** skill inspection runs
- **THEN** the original resolution failure remains visible without a bundled install suggestion.

### Requirement: Accurate bundled installation grammar and distinct mutation stages
Help and command documentation SHALL identify the `schemas install` argument as a bundled schema name rather than a filesystem path, use one global `--project` option per invocation, and distinguish schema installation, skill selection/replacement, schema activation, and host command-adapter installation. Each mutation MUST have its own exact preview and fresh apply token; the parser SHALL retain its accepted placement for a single project option and reject duplicate options or filesystem paths as bundled names.

#### Scenario: Catalog name versus source directory
- **GIVEN** a packaged schema has a catalog name and a source directory
- **WHEN** a caller installs first by name and then by directory path
- **THEN** the named request reaches the guarded preview while the path is rejected as a non-name without copying files.

#### Scenario: Separate preview tokens
- **GIVEN** a caller installs a schema, replaces a skill collision, activates a schema, and installs adapters
- **WHEN** the caller applies each reviewed operation
- **THEN** each operation requires its own fresh token and no earlier token authorizes another stage.

### Requirement: Explicit guarded single-skill replacement
The CLI SHALL expose a separate `skills replace` operation for an exact project-relative unmanaged skill target, with explicit installed schema, declared bundle and unique backup identifier. Replacement SHALL affect only the selected target; it SHALL NOT activate the schema, install unrelated skills or adapters, or loosen normal install/switch collision refusal. Exact receipt inspection SHALL be read-only, and restoration SHALL be a separate preview/token Apply. The command SHALL disclose that active-pin, ownership, containment, freshness and backup safeguards apply and that retained backups are available for recovery.

#### Scenario: Replace one OMP collision before activation
- **GIVEN** an installed schema's selected OMP bundle has an unmanaged collision
- **WHEN** a caller previews and applies one exact target replacement
- **THEN** only that target is replaced after its fresh authorization, its backup can be inspected, other collisions still block full-set activation, and command adapters remain separate.

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

