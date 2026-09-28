## 1. Reader-facing introduction

- [x] 1.1 Update the opening of `README.md` to state what the OpenSpec adaptation does, who uses it alongside other skills, and why the creator wanted repeatable workflows and durable change records. Proof: a reviewer can answer what/who/why from the text before the first installation heading, including the exact phrase “durable change records.”
- [x] 1.2 Keep the current checkout first-use path, Bun/OpenSpec requirements, CLI and dashboard links, and safety and resource sections accurate, without promising that a schema forces agent behavior or asserting an npm version has been published. Proof: compare the changed text against `package.json`, `docs/commands.md`, and current installation commands.

## 2. Documentation verification

- [x] 2.1 Run `git diff --check`, check local README links and named commands, and run `openspec validate readme-positioning --type change --strict`. Proof: no broken local links, unsupported product claims, or changes outside the README and this plan.

## Next Handoff

Implementation is complete. Review the README change before archiving with `/opsx-archive readme-positioning`.
