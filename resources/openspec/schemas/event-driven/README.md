# Event-Driven OpenSpec Schema

`event-driven` is for systems that communicate through events and require a
clear discovery-to-spec workflow before implementation planning.

Key references:
- AsyncAPI: https://www.asyncapi.com/
- Event Storming: https://en.wikipedia.org/wiki/Event_storming

- Good fit: event-centric domains, asynchronous integrations, pub/sub systems,
  and teams that need a validated AsyncAPI contract before coding.
- Not a good fit: tiny low-risk changes where `specs -> tasks` is enough and
  no event architecture decisions are required.

## Install (copy/paste)

Use the root `README.md` single-line install command with:
- `SCHEMA="event-driven"`

## Activate

Artifact paths come from CLI `status`/`instructions`: use `changeRoot`,
`artifactPaths`, `resolvedOutputPath`, and concrete dependency paths. `generates`
is relative to `changeRoot`. For `specs/**/*.md`, write non-empty
`<changeRoot>/specs/<capability>/spec.md` files, never a literal glob or empty
directory. Verify file contents and refreshed `existingOutputPaths` and status.
Missing metadata blocks work; never guess a repository-local change root.
Choose kebab-case capabilities from approved event-modeling scope.
`template: specs/spec.md` identifies the schema template, not an output path.
Run AsyncAPI validation against its CLI-resolved output, not a guessed cwd file.

Set this in `openspec/config.yaml`:

```yaml
schema: event-driven
```

## Stage Gates

Artifact order:
`event-storming -> event-modeling -> specs -> design -> asyncapi -> tasks`

Gate expectations:
- `event-modeling` must use outputs from `event-storming`.
- `specs` and `design` must be completed before `asyncapi`.
- `tasks` are planned only after reviewed `specs`, reviewed `design`, and a
  validated AsyncAPI document (`asyncapi-cli validate asyncapi.yaml`).

## Mermaid Color Legend

Use explicit `classDef` and `class` assignments in Mermaid templates so color
semantics stay stable across renderers.

Event-storming standard baseline:
- Domain Event: orange (`event`)
- Command: blue (`command`)
- Actor/User: yellow (`actor`)
- Policy/Automation: violet family (`policy`)
- Read Model/Projection: green (`readModel`)

Event-driven schema mapping notes:
- `Trigger` in `event-modeling` is treated as the actor/user lane and should use
  the `actor` color mapping.
- Prefer `Read Model` node labels in event-modeling artifacts and
  `Read Model/Projection` labels in event-storming artifacts; both map to
  `readModel` (green).

## Associated Skills

This schema declares its companion skills in `skills.txt`; they are installed automatically by Step 6 of `AGENT_INSTALL.md` into `.agents/skills/`, sourced from [intent-driven-dev/skills](https://github.com/intent-driven-dev/skills).

- `c4-diagrams` — C4-style architecture diagrams in ASCII or Mermaid.
- `glossary` — keeping domain/technical terms consistent across artifacts.
- `openspec-git-discipline` — git hygiene for OpenSpec propose/apply/archive workflows.

For more schemas, refer to https://github.com/intent-driven-dev/openspec-schemas.
