## Context

The existing `.agents/skills/opentui` mirrors msmps; `.omp/skills/opentui-react` offers deeper React material. Neither provides a complete design workflow or independently audited official-doc coverage. This change adds skill documentation and checks, not application behavior. Journey and two capability specs own intent and behavior.

## Goals / Non-Goals

**Goals:** Agent Skills-compatible portable entries, terminal-native design and proof workflow, explicit library boundaries, source-revision coverage inventory and offline validation.

**Non-Goals:** Vendoring canonical or third-party source, installing packages, certifying API behavior by link presence, changing application runtime.

## Selected Direction

Use `skills/` as a future-extractable collection. Keep existing deep content as source material and route into it locally only when references are inside the skill root; for portability, copy focused references into the new skill as needed rather than use cross-skill relative links. Official URLs are authoritative for fast-changing APIs. Generate a committed path inventory from an upstream commit; map every entry to a skill/route and assign `linked` or `review-needed`, never imply `verified` without tests.

## Implementation Guardrails

- Frontmatter name equals folder, metadata values strings, concise trigger description; relative links remain inside the skill.
- Third-party instructions name source and framework. Registry add commands mutate consumer files and require review; do not install automatically.
- Examples only use documented package entrypoints; link to canonical docs when specific APIs are not locally exercised.
- Design and testing skill demands actual frame/input evidence, not just typechecking.
- Inventory checker is deterministic and offline by default; a separate refresh uses an explicit upstream revision.

## Alternatives Considered

One giant skill would obscure task routing and inflate activation context. Symlinks to neighboring skills would not survive extraction. Vendored docs would drift and raise licensing costs.

## Risks / Trade-offs

Links can drift; committed revision and refresh diff expose changes. Catalogs evolve; third-party guidance is deliberately scoped and tested at pinned versions. Broad coverage is not synonymous with API verification.

## Migration Plan

Keep existing `.agents` and `.omp` entries intact while the new collection is validated. Publish/copy the new `skills/` tree later, with compatibility checks before replacing old entrypoints.

## Open Questions

Future repository name and publish mechanism are deferred; no runtime decision depends on them.
