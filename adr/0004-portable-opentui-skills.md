# ADR 0004: Portable OpenTUI skills with canonical coverage evidence

Status: Proposed  
Date: 2026-09-25

## Context

This application carries a mirrored general OpenTUI skill and a React-specific skill. The user intends to publish a separate reusable collection, including design and third-party component libraries. A monolithic copy of official documentation would drift and be expensive to activate.

## Decision

Develop a portable collection under `skills/` with Agent Skills-compatible independent directories. A compact entry skill routes by framework and need; focused skills own design, official components, optional libraries, and verification. Official OpenTUI documentation remains authoritative, with a versioned path/ownership inventory and explicit review state. Third-party libraries are separate, opt-in, and never described as built-ins. Existing installed skills remain untouched until the collection passes evaluation.

## Consequences

Each skill must work when extracted independently; no cross-skill relative file dependency. A linked page is discoverable but not API-verified. The inventory detects upstream drift, while example and agent-task tests validate behavior. Registry commands must not run without awareness that they write application source and dependencies.

## Alternatives

One exhaustive SKILL.md loads too much context. Copying upstream prose verbatim adds licensing and staleness risk. Replacing existing skills immediately would regress current users before tests.
