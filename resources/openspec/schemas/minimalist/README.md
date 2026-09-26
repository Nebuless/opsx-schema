# Minimalist OpenSpec Schema

`minimalist` is for getting to build quickly with a direct `specs -> tasks` flow.

- Good fit: landing pages and simple apps with too many technical design decisions.
- Not a good fit: complete apps with multiple layers, database work, and broader architecture concerns.

## Install (copy/paste)

Use the root `README.md` single-line install command with:
- `SCHEMA="minimalist"`

## Activate

Artifact paths come from CLI `status`/`instructions`: use `changeRoot`,
`artifactPaths`, `resolvedOutputPath`, and concrete dependency paths. `generates`
is relative to `changeRoot`. For `specs/**/*.md`, write non-empty
`<changeRoot>/specs/<capability>/spec.md` files, never a literal glob or empty
directory. Verify file contents and refreshed `existingOutputPaths` and status.
Missing metadata blocks work; never guess a repository-local change root.
Choose kebab-case capabilities from agreed scope; no proposal is required.
`template: specs/spec.md` identifies the schema template, not an output path.

Set this in `openspec/config.yaml`:

```yaml
schema: minimalist
```

## Spec Format

When authoring `specs` artifacts in this schema:
- Write each requirement as a user story:
  `As a <role>, I want <capability>, so that <benefit>.`
- Write acceptance criteria using Gherkin structure:
  `Given ...`, `When ...`, `Then ...`

## Associated Skills

This schema declares its companion skills in `skills.txt`; they are installed automatically by Step 6 of `AGENT_INSTALL.md` into `.agents/skills/`, sourced from [intent-driven-dev/skills](https://github.com/intent-driven-dev/skills).

- `openspec-git-discipline` — git hygiene for OpenSpec propose/apply/archive workflows.

For more schemas, refer to https://github.com/intent-driven-dev/openspec-schemas.
