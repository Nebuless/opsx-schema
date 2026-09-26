## ADDED Requirements

### Requirement: Distinct-identity bundled schema updates
When a newer bundled schema differs from an installed schema of the same name, Opsx SHALL offer an explicit installation under a distinct, valid schema name instead of overwriting the old named tree. The installed schema SHALL validate under its new identity and record its bundle source and content identity. The previous named schema and every active or archived change pinned to it MUST remain resolvable with their previous effective content; changing the project default or migrating pins MUST remain a separate reviewed operation.

#### Scenario: Install newer content beside an active pinned revision
- **GIVEN** an owned installed `intent-driven-design` revision with an active or archived change pinned to it, and a newer bundled revision with different content
- **WHEN** a person previews and authorizes installing the newer bundle under an unused valid name such as `intent-driven-design-next`
- **THEN** the new named schema resolves and validates, the original schema's bytes and pinned change behavior are unchanged, and the project default remains unchanged until a separate switch.

#### Scenario: Existing target is identical
- **GIVEN** an installed named schema whose declared bundle content is identical to the requested source
- **WHEN** the same installation is previewed again
- **THEN** the operation reports no change and does not rewrite the installed tree or revision provenance.

#### Scenario: Changed same-name or conflicting destination
- **GIVEN** an installed schema whose content differs from the requested bundle, or a proposed new name whose target already exists with different ownership or content
- **WHEN** installation is previewed without a distinct collision-free identity
- **THEN** it refuses the mutation with the conflicting path and reason; it does not alter either schema tree, project default, or existing pins.

#### Scenario: Host-independent revision with separately targeted resources
- **GIVEN** the updated bundled schema declares managed skills, schema workflow adapters, or MCP servers for first-class OpenCode, OMP, Pi, Atomic, and Senpi
- **WHEN** it is installed beside the old named revision and its host resources are inspected
- **THEN** the new OpenSpec schema has one independently validated name and content identity, the old schema and active or archived pins retain their previous effective content, and each host's adapter, skill and server target is previewed and approved through its own host contract rather than being implied by schema installation.
