# Agent Resource Install Guide

The `resources/` tree is bundled with the `opsx-schema` CLI/TUI. It is not a standalone package or public shell-installer surface. Use the CLI for schema, skill, MCP, and adapter operations; do not copy files out of this tree or invoke its internal scripts to install resources.

## Prerequisites

- An initialized OpenSpec project.
- The `opsx-schema` command available in that project or environment.

## Install and select a schema

From the target project's root, inspect the bundled schemas and preview an installation:

~~~sh
opsx-schema schemas bundled
opsx-schema --project . schemas install intent-driven-design
~~~

Review the exact target and planned changes. To apply, repeat the exact command with the fresh token returned in its preview:

~~~sh
opsx-schema --project . schemas install intent-driven-design --apply-token <token>
~~~

Installing places the schema under the project's `openspec/schemas/` directory. Selecting it as the project's active schema is a separate previewed operation:

~~~sh
opsx-schema --project . schema switch intent-driven-design
~~~

Repeat with that preview's `--apply-token <token>` only after reviewing the target and plan.

## Install schema-declared skills

Inspect a schema's read-only skill catalog and agent profiles, then preview installation for the chosen profile. Repeat with the preview token only after reviewing the planned targets:

~~~sh
opsx-schema skills inspect intent-driven-design
opsx-schema --project . skills install intent-driven-design --profile <agent-id>
~~~

Select a skill tier with `--bundle default`, `--bundle recommended`, or `--bundle all`. Supply one or more `--profile <agent-id>` flags as needed.

## Install MCP providers

List and inspect provider metadata before previewing an install:

~~~sh
opsx-schema mcp list --schema intent-driven-design
opsx-schema mcp inspect <provider> --schema intent-driven-design
opsx-schema --project . mcp install <provider> --host omp --schema intent-driven-design
~~~

MCP apply requires both stdin and stdout attached to a TTY and explicit typed approval of the provider safety metadata, selected host, target path, and exact configuration diff. A token by itself is not approval.

## Install compound adapters

Inspect a host projection and preview its installation with the CLI. Supported hosts are `opencode`, `senpi`, `pi`, and `atomic`:

~~~sh
opsx-schema --project . adapters inspect pi --scope project
opsx-schema --project . adapters install pi --scope project
~~~

Review the planned file targets and repeat the install command with its current `--apply-token <token>` to apply.

## Validate

Use `opsx-schema --project . doctor` and `opsx-schema --project . verify` for project diagnostics. From the source repository, `bun run test:schemas` runs internal resource, adapter, and schema checks; OpenSpec schema validation is included when the OpenSpec executable is available.
