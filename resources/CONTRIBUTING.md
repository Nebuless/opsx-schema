# Contributing

The repository-root `opsx-schema` package is the sole application and installer surface. `resources/` is its bundled data archive, not a standalone package; keep install operations in the CLI and do not add public shell-installer instructions here.

## Resource layout

- Schemas live in `openspec/schemas/<schema-name>/` and must remain self-contained directories that the CLI can install.
- Schema-associated skills are declared by each schema's skills.txt file.
- Compound adapter source is in openspec/schemas/compound-intent-driven/adapters/shared/; host projections live under .opencode/, .senpi/, .pi/, and .atomic/.
- Companion host skills stay under their existing dot-directories; bundled schemas live under openspec/schemas/. Project planning and archived change records belong in the repository-root openspec/ tree, not in resources/openspec/. Resource-local legacy archives and specs are excluded from the public source and npm package. The current authoring change may remain in resources/openspec/changes/ in source but is not shipped in the package.
- CLI installation and schema-selection guidance belongs in the repository-root command guide and these resource guides.

Preserve source schema bytes when transplanting or regenerating resource copies. When changing an adapter, update all four host projections consistently.

## Checks

From the repository root, run:

~~~sh
bun run test:schemas
~~~

The check runs resource-layout, workflow, adapter, and internal installer checks. It also validates each bundled schema when the OpenSpec executable is available. Internal shell helpers may be used to diagnose these checks, but they are not a public install path.

When adding a schema, keep its schema name and folder aligned, update CLI/resource guidance, and ensure the schema is covered by the resource integrity checks. When changing a companion skill manifest, MCP catalog, or adapter projection, preserve the CLI preview/apply safety boundary and add an observable success or failure case to the relevant check.
