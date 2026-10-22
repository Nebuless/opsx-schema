## ADDED Requirements

### Requirement: Required schema dependencies
The installer SHALL install schema-declared required skills before reporting schema installation or selection successful, include them in every declared bundle, and default to the shared named profile when no destination is selected.

#### Scenario: Default Impeccable installation
- **GIVEN** intent-driven-design declares required Impeccable and no skill destination was selected
- **WHEN** the user applies the exact installation or switch preview
- **THEN** the reviewed Impeccable revision is installed into `.agents/skills/impeccable` before success
- **AND** no optional MCP configuration is created

#### Scenario: Required source changed after preview
- **GIVEN** a preview includes required declarations and an immutable source revision
- **WHEN** a manifest, source, ownership record, or destination changes before Apply
- **THEN** Apply refuses stale state without activating an unprepared default

### Requirement: Distinct native OmO destinations
The installer SHALL keep OmO `.omo/skills` and `.omo/mcp.json` distinct from standalone Senpi `.senpi` targets.

#### Scenario: OmO selected explicitly
- **GIVEN** the selected native host is OmO
- **WHEN** skill installation or separately human-approved MCP installation is applied
- **THEN** only the reviewed OmO destination is written and unrelated Senpi state is preserved

### Requirement: Evidence-based Pi mode
Pi MCP setup MUST distinguish inspected native mode from a verified existing legacy adapter, preserve project trust and freshness checks, and never install or migrate an adapter implicitly.

#### Scenario: Native Pi
- **GIVEN** trusted project settings and inspected supported native Pi evidence
- **WHEN** a provider installation is previewed
- **THEN** the target is `.pi/mcp.json` and Apply still requires immediate human approval

#### Scenario: Existing legacy adapter
- **GIVEN** a verified installed adapter registered in effective project or global settings
- **WHEN** provider installation is previewed
- **THEN** the legacy `.mcp.json` target is retained

#### Scenario: Ambiguous or changed host
- **GIVEN** unknown mode, conflicting extensions, untrusted project settings, or host evidence changed after preview
- **WHEN** configuration is requested
- **THEN** setup refuses without installing, migrating, or writing provider configuration
