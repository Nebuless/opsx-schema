# openspec/schemas

## Purpose

OpenSpec schema definitions, templates, skill declarations, and host adapters.

## Ownership

Each directory owns a project-local schema contract and resources. This parent owns schema selection conventions and child boundaries. Packaged schema sources belong to `resources/openspec/schemas/`, not this tree.

## Local Contracts

- Keep schema files internally consistent with declared artifact paths and gates.
- Keep host projections separate from canonical adapter sources.
- Preserve existing adapter parity requirements.

## Work Guidance

Read schema README, config, and nearest adapter contract before changing schema resources.
For local Compound command bodies, read [the shared adapter contract](compound-intent-driven/adapters/shared/AGENTS.md). Its seven commands are distinct from the nine packaged command bodies; do not assume copy parity between the trees.

## Verification

Run `openspec schema validate <schema-name>` for the affected local schema. Run `bun run test:schemas` when packaged resources change; that suite checks the bundled tree, not local command-body parity.

## Child DOX Index

No direct-child DOX files. The existing shared adapter contract applies within its nested directory.
