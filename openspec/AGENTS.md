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

Read status and instructions before changing artifacts. Respect each change's authorized mutation paths.

## Verification

Use named OpenSpec status and schema validation commands from root workflow rules.

## Child DOX Index

- `openspec/schemas/AGENTS.md` — schema implementations and adapters.
- `openspec/changes/AGENTS.md` — change-local artifacts and archives.
- `openspec/specs/AGENTS.md` — durable capability specifications.
