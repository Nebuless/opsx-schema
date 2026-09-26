# OpenSpec Schemas

A bundled resource collection for the `opsx-schema` CLI/TUI: nine OpenSpec workflows, companion agent skills, MCP provider catalog data, and host adapters. This directory is not a standalone installable package. Use the CLI to preview and apply resource changes in a project.

OpenSpec provides the built-in spec-driven workflow. This collection adds nine alternatives for different planning styles.

## Schema catalog

| Schema | Good fit |
| --- | --- |
| [minimalist](./openspec/schemas/minimalist/README.md) | A direct specs-to-tasks flow for small, low-risk work. |
| [event-driven](./openspec/schemas/event-driven/README.md) | Event-centric systems that need discovery and an AsyncAPI contract. |
| [spec-driven-with-adr](./openspec/schemas/spec-driven-with-adr/README.md) | Proposal-to-tasks work with durable architecture decisions. |
| [behaviour-driven](./openspec/schemas/behaviour-driven/README.md) | Observable behavior specified with Gherkin-style scenarios. |
| [intent-driven](./openspec/schemas/intent-driven/README.md) | Intent, behavior, design, and architecture captured before implementation. |
| [intent-driven-engineering](./openspec/schemas/intent-driven-engineering/README.md) | Intent-driven planning with stage-specific engineering practices. |
| [intent-driven-superpowers](./openspec/schemas/intent-driven-superpowers/README.md) | Intent-driven work with selected Superpowers and engineering skills. |
| [intent-driven-design](./openspec/schemas/intent-driven-design/README.md) | A guided design journey for work with material product decisions. |
| [compound-intent-driven](./openspec/schemas/compound-intent-driven/README.md) | OpenSpec lifecycle work adapted to Compound Engineering practices. |

The schema folders are self-contained under `openspec/schemas/<name>/` in this bundle. Their schema-local READMEs are byte-preserved source snapshots; any older checkout or copy-paste install examples there are historical. The `opsx-schema` CLI owns installation; do not copy resource files or invoke the internal validation/install scripts directly.

## Install a schema

From the target project's root, inspect the bundled catalog and preview a schema installation:

~~~sh
opsx-schema schemas bundled
opsx-schema --project . schemas install intent-driven-design
~~~

The installation command prints the exact target, planned changes, and an apply token. Review the preview, then repeat the same command with its current token to apply:

~~~sh
opsx-schema --project . schemas install intent-driven-design --apply-token <token>
~~~

To select an installed schema for the project, use the separate schema-switch preview and apply flow:

~~~sh
opsx-schema --project . schema switch intent-driven-design
~~~

## Companion resources

Schemas declare associated skills in `skills.txt`. Inspect the read-only skill catalog and preview installation for a named agent profile with the CLI:

~~~sh
opsx-schema skills inspect intent-driven-design
opsx-schema --project . skills install intent-driven-design --profile <agent-id>
~~~

MCP providers are available through the schema's provider catalog. List and inspect them before previewing an install; MCP apply requires an interactive TTY and explicit typed approval of the provider safety metadata, selected host, target path, and exact config diff:

~~~sh
opsx-schema mcp list --schema intent-driven-design
opsx-schema mcp inspect <provider> --schema intent-driven-design
opsx-schema --project . mcp install <provider> --host omp --schema intent-driven-design
~~~

The `compound-intent-driven` schema also includes nine shared adapters projected for OpenCode, Senpi, Pi, and Atomic (36 host files total). Inspect and preview a host adapter install through the CLI, then repeat the install command with the preview's current token to apply:

~~~sh
opsx-schema --project . adapters inspect pi --scope project
opsx-schema --project . adapters install pi --scope project
~~~

All mutation commands preview by default and require the matching apply token. Companion skills and host-specific resources are bundled under `.agents/`, `.claude/`, `.codex/`, `.omp/`, `.opencode/`, `.pi/`, `.senpi/`, and `.atomic/`; use the CLI rather than copying these trees manually.

## Provenance

This collection is a Nebuless-maintained fork and extension of [Hari Krishnan's OpenSpec Custom Schemas](https://github.com/intent-driven-dev/openspec-schemas), originally published by [Hari Krishnan](https://github.com/harikrishnan83). The five upstream schema names are minimalist, event-driven, spec-driven-with-adr, behaviour-driven, and intent-driven. The underlying [OpenSpec project](https://github.com/Fission-AI/OpenSpec) is separate from this schema collection.

## Contributing and checks

See [CONTRIBUTING.md](./CONTRIBUTING.md) for resource and validation conventions. From the repository root, run `bun run test:schemas` for internal resource checks. If the OpenSpec executable is installed, the check also validates all nine schemas.
