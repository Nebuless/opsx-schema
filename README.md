# opsx-schema

Choose an [OpenSpec](https://github.com/Fission-AI/OpenSpec) workflow, inspect your changes, and manage companion agent skills from one CLI or terminal dashboard. OpenSpec still owns the change lifecycle.

## Run without installing

Use [Bun 1.4+](https://bun.sh/) and, for project commands, OpenSpec CLI 1.12.0 on your `PATH`. From a terminal in an OpenSpec project:

```sh
bunx opsx-schema
```

This opens the interactive dashboard. Outside a project, browse the bundled schemas with `bunx opsx-schema schemas bundled`. In scripts or other non-interactive sessions, use an explicit command instead of the dashboard. You can pass `--project <root>` before a command to target a particular project.

## Common commands

```sh
# See what is in the package before choosing a workflow.
bunx opsx-schema schemas bundled
bunx opsx-schema schemas bundled intent-driven

# Inspect an existing project and its changes.
bunx opsx-schema status
bunx opsx-schema changes
bunx opsx-schema archive

# Install a bundled schema, then select it as the project default.
bunx opsx-schema --project . schemas install intent-driven
bunx opsx-schema --project . schema switch intent-driven --profile codex --bundle default

# Work through a change using the selected schema.
bunx opsx-schema change create account-export --description "Let users export their data"
bunx opsx-schema change status account-export
bunx opsx-schema change instructions account-export proposal
bunx opsx-schema change validate account-export
bunx opsx-schema change archive account-export
```

Commands that change files **preview only** on the first run. Review the preview, then repeat the same command with its fresh `--apply-token <token>` to apply. Installation and switching are separate steps; installing a schema does not select it. The archive example also needs its preview token before it changes anything.

See [workflows and schema choices](./docs/workflows.md) for all command families, what each schema is for, and a start-to-finish CLI path. The [command reference](./docs/commands.md) covers flags, output and approval rules. Contributors: [resource overview](./resources/README.md), [contribution guide](./resources/CONTRIBUTING.md), and [CI checks](./docs/ci.md).

The schema collection extends [Hari Krishnan’s OpenSpec Custom Schemas](https://github.com/intent-driven-dev/openspec-schemas) ([resource license](./resources/LICENSE)); the CLI is MIT licensed.
