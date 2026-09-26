## 1. Source-aware installation

- [x] 1.1 Add `scripts/install-schema-skills.sh` to install legacy and tab-delimited source-aware manifests with preflight collision and path validation. Verify with isolated fixture directories covering multi-source install, legacy install, collision rejection, malformed declaration rejection, and forced replacement.
- [x] 1.2 Update `AGENT_INSTALL.md` and `README.md` to use the installer and define source-aware/legacy manifest behavior. Verify guide commands and examples name existing paths and preserve no-overwrite default.

## 2. Engineering workflow schema

- [x] 2.1 Add copyable `openspec/schemas/intent-driven-engineering` preserving the intent-driven artifact graph and template alignment. Verify with `openspec schema validate intent-driven-engineering`.
- [x] 2.2 Declare all intent-driven and selected Matt Pocock companion skills using source-qualified manifest lines, replacing legacy `grill-me` with `mattpocock/skills<TAB>skills/productivity/grilling`. Verify every declaration source/path resolves in clean shallow clones of its source repository.
- [x] 2.3 Add phase guidance for domain modeling/research/current `grilling`, deep-module design, vertical tasks, conditional diagnosis or TDD, targeted verification, and two-axis review without tracker or commit requirements. Verify `openspec instructions` for proposal, design, tasks, and apply exposes the expected discipline and OpenSpec remains planning/apply authority.

## 3. End-to-end validation

- [x] 3.1 Install `intent-driven-engineering` into an isolated consumer project with the new installer. Verify all fifteen skill directories exist, then run `openspec schema validate intent-driven-engineering` from that project.
- [x] 3.2 Create a disposable change in that consumer project with `intent-driven-engineering`, inspect OpenSpec artifact status and phase/apply instructions, and run `openspec validate <change> --type change --strict`. Verify artifact dependency order and validation pass.
- [x] 3.3 Review implementation from upstream baseline `4bb6de2f57c9275a18a4106341fe4632f5026ac6` against change artifacts and repository standards. Verify each finding is resolved or explicitly recorded before final completion.
