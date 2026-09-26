## Why

Agents building this project's OpenTUI UI need a portable, verifiable path from user brief to designed terminal application. Existing framework references are deep but do not route design and third-party component selection consistently, and upstream coverage cannot be audited automatically.

## Scope

Deliver Agent Skills-compatible routing, design, framework, official-component, termcn, tuiparts and verification entries; preserve existing deep references through links or migration; add versioned documentation coverage data and validation.

## Exclusions

No automatic installation into consumer projects, redistribution of third-party component source, or assertion of independent verification for every upstream API. Full per-page API expansion can follow the recorded gaps.

## What Changes

An agent can choose the correct OpenTUI stack and optional library, follow a terminal-native design loop, and check its implementation. Maintainers can see whether official documentation topics have an owned route and what still requires review.

## Capabilities

### New Capabilities

- `opentui-skill-collection`: discoverable, portable skills with explicit library boundaries and design/test workflows.
- `opentui-documentation-coverage`: versioned mapping of canonical documentation to local ownership and outstanding review.

### Modified Capabilities

- None; application runtime behavior is unchanged.

## Selected Direction

Use a compact router and focused on-demand references. Keep the official docs authoritative and third-party catalogs distinct.

## Impact

Skill authors and agents gain a cohesive workflow. No application dependencies or end-user commands change. Existing skills remain available during migration.
