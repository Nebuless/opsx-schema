## ADDED Requirements

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

## Next Handoff

`openspec instructions design --change "build-opsx-schema-application" --json`
