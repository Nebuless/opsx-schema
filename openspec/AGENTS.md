# openspec

## Purpose

OpenSpec workflow authority: repository configuration, schema definitions, active changes, and specifications.

## Ownership

`config.yaml` selects schema and lifecycle policy; `schemas/` defines schema behavior; `specs/` stores durable capability specifications; `changes/` stores change-local artifacts and archives.

## Local Contracts

- Use OpenSpec CLI for lifecycle and artifact operations.
- Keep artifact gates and selected schema authoritative.
- Do not create parallel plans or trackers outside authorized OpenSpec paths.

## Work Guidance

Read `openspec status --change <change> --json` and `openspec instructions <artifact> --change <change> --json` before changing artifacts. Use returned `changeRoot`, `artifactPaths`, and `resolvedOutputPath`; do not guess paths or copy an old change's schema gates. Respect each change's authorized mutation paths.

These are project-local schemas and records, not the packaged catalog in `resources/openspec/schemas/`. Read the root ownership map before changing schema copies or host projections.

## Verification

Run `openspec validate <change> --type change --strict` for the selected change. For a local schema change, also run `openspec schema validate <schema-name>`. These checks do not replace the implementation proof required by the change's tasks.

## Child DOX Index

- `openspec/schemas/AGENTS.md` — schema implementations and adapters.
- `openspec/changes/AGENTS.md` — change-local artifacts and archives.
- `openspec/specs/AGENTS.md` — durable capability specifications.
