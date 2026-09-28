# opsx-schema

I liked OpenSpec's durable change records, but I also use other skills. I built `opsx-schema` to make repeatable workflows easier to set up and see from one place.

This OpenSpec adaptation gives people using other skills one Bun CLI and terminal dashboard to choose schema workflows and companion skills intentionally, inspect changes, and manage resources. OpenSpec still owns the change lifecycle; this tool does not replace it.

The `opsx-schema` package bundles the custom schemas and host resources and is the only supported app/installer for schema, agent-skill, and MCP management.

## Package and installation

The repository root is the canonical `opsx-schema@0.1.0` package. The previously published `@nebulesstech/openspec-schemas@1.8.0` is a legacy standalone schema package. Its separate install path is deprecated for the current workflow and is not used or required by `opsx-schema`.

From a checkout:

```sh
bun install
bun src/domain/cli.ts --help
bun src/domain/cli.ts --json schemas bundled
bun src/domain/cli.ts --json mcp list --schema intent-driven-design
```

To smoke-test the single distributable in an isolated consumer, pack the repository root once and install that tarball; no second schema tarball or dependency override is needed:

```sh
TMP_DIR=$(mktemp -d)
bun pm pack --destination "$TMP_DIR"
mkdir "$TMP_DIR/consumer"
printf '{"private":true}\n' > "$TMP_DIR/consumer/package.json"
(cd "$TMP_DIR/consumer" && bun add "$TMP_DIR"/opsx-schema-*.tgz)
"$TMP_DIR/consumer/node_modules/.bin/opsx-schema" --help
"$TMP_DIR/consumer/node_modules/.bin/opsx-schema" --json schemas bundled
```

For a version published to npm, install the CLI with Bun:

```sh
bun add --global opsx-schema@<version>
opsx-schema --help
```

Requirements: Bun 1.4 or newer, and OpenSpec CLI 1.12.0 for project-aware commands. On an interactive terminal, `bun src/domain/cli.ts --project .` opens the dashboard. Bun runs the TypeScript entry point directly; there is no separate build step. A bare invocation without a usable TTY fails rather than emitting UI into a pipe. Use explicit commands for noninteractive work. See the [command guide](./docs/commands.md) for syntax, output contracts, and approval boundaries.

Every mutation previews first. Schema installation/switching and agent-skill installation require their exact preview token before Apply. `skills inspect` is a local, read-only catalog query; `skills install` may fetch schema-declared external GitHub skill repositories while preparing its preview. MCP list/inspect and install preview read the bundled catalog and do not write provider configuration. MCP Apply has its own interactive approval gate; no schema operation installs a provider implicitly.

## Resource authoring

The npm tarball contains runtime schemas, host resources, linked resource guides, and licenses, not resource-local planning history. The curated public source retains project documents under root openspec/; legacy archives and specs from resources/openspec/ are excluded from this new repository.

The canonical bundled sources are under `resources/`. Edit a schema at `resources/openspec/schemas/<name>/`: `schema.yaml` defines its artifact workflow, `templates/` contains artifact templates, and optional `skills.txt` and `mcp.yaml` declare companion resources. Shared command adapters remain schema-local under `resources/openspec/schemas/compound-intent-driven/adapters/`. Host-specific resources retain their host trees under `resources/.agents/`, `resources/.atomic/`, `resources/.claude/`, `resources/.omp/`, and the other `resources/.*` directories. `resources/LICENSE` covers the schema collection; `assets/schemas/manifest.json` and `assets/adapters/manifest.json` pin integrity metadata. Do not create a second package or edit duplicate schema/host payloads elsewhere.

See the [resource overview](./resources/README.md) and [contribution guide](./resources/CONTRIBUTING.md) for the collection's workflows and provenance.

## Verify

```sh
bun run typecheck
bun run test:app
bun run test:schemas
bun test test/integration/distribution.test.ts
bun run check
```

The distribution smoke test packs one root tarball, installs it into a temporary consumer, exercises the installed CLI, and applies a schema only inside a disposable OpenSpec project. It exercises MCP catalog/preview reads only; it never applies a provider configuration. Neither the dashboard nor the bundle requires a sibling checkout or an install of the legacy schema package.

## Source and license

This is the new repository for the earlier Nebuless OpenSpec schemas work. It combines the schema collection with the CLI, dashboard, and standalone OpenTUI skills. The public Git history starts with this curated migration; it does not import the earlier repository history or local benchmark and switch-journal data. The legacy `@nebulesstech/openspec-schemas` package remains separate.

The schema collection is a Nebuless-maintained fork and extension of [Hari Krishnan's OpenSpec Custom Schemas](https://github.com/intent-driven-dev/openspec-schemas). [OpenSpec](https://github.com/Fission-AI/OpenSpec) supplies the underlying workflow engine. See [resources/LICENSE](./resources/LICENSE) for the collection license; the root application is MIT licensed.
