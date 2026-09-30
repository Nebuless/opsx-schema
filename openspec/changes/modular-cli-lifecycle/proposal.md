## Why

CLI transport, command handling, and lifecycle workflows are concentrated in two large files. Creation and schema switching also form a circular module dependency. These are maintainability risks, not demonstrated user-facing failures. Separating responsibilities makes later changes easier to review without rewriting working behavior.

## Scope

Reorganize CLI command handlers and creation, read, archive, and schema-handoff workflows into focused TypeScript modules. Preserve the full existing CLI, dashboard, bundled-schema, skill, MCP, adapter, provenance, validation, and recovery contracts.

## Exclusions

No new commands, removed features, parser redesign, command framework, dependencies, new retries or locking, bundled-resource edits, npm release work, or implementation without approval.

## What Changes

Internal module ownership and imports change. The executable path, command grammar, flags, text and JSON output, exit behavior, project discovery, dashboard behavior, and mutation semantics remain unchanged. The old lifecycle barrel is removed after all internal callers migrate; no compatibility shim remains.

## Capabilities

### New Capabilities

None. This change introduces no new user-facing feature.

### Modified Capabilities

- `project-and-agent-cli`: make behavior-preserving CLI/lifecycle compatibility explicit, including executable startup, command-family coverage, output and approval boundaries, and failure-state preservation. Existing canonical requirements remain in force.

## Selected Direction

Direct extraction of existing logic into ordinary command-family and lifecycle modules, with one small executable and one-way dependencies. Discovery, route, and module-direction approvals are recorded in `journey.md`. A task checklist and implementation still require their separate approval gates.

## Impact

Developers migrate imports in CLI handlers, schema switching, and existing tests. End users retain every current workflow; no data migration, profile change, provider installation, or package-bin change is intended. Existing OpenSpec lifecycle authority and repository ADRs remain unchanged. Unrelated active changes are untouched.
