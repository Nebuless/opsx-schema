# OpenTUI skill collection

Portable Agent Skills for official OpenTUI, terminal-native design, optional termcn/tuiparts libraries, and evidence-based verification. Every directory with `SKILL.md` is independently installable; no skill relies on a sibling file path. Start with [`opentui`](opentui/SKILL.md), then activate the focused skill that matches the task.

The `opentui` and `opentui-react` deep references originate from the existing project skills (msmps general skill and project React skill). Canonical API authority is [OpenTUI docs](https://opentui.com/docs/). Third-party catalog references are separate and opt-in. Source revisions are recorded in [`coverage/sources.json`](coverage/sources.json). Do not mistake an inventory link for an API test.

## Coverage and validation

`coverage/official-opentui.json` records the upstream commit and every canonical docs path, assigned to a skill. `review-needed` deliberately means discoverable but not independently checked. Offline check: `node skills/scripts/coverage.mjs`. Compare a GitHub recursive tree response without changing the manifest: `node skills/scripts/coverage.mjs --tree /path/to/tree.json`. Update only against a deliberately chosen full commit: `node skills/scripts/coverage.mjs --refresh --tree /path/to/tree.json --revision <sha>`; inspect the diff and review changed pages before marking anything `verified`.

Run `node skills/scripts/validate.mjs` for frontmatter, local links, and coverage checks; also run `uvx --from skills-ref agentskills validate skills/<name>` for the formal Agent Skills reference validator. Finally evaluate agent outputs in real terminal tasks. Format validation alone is not API or design validation.

Third-party code and themes are not redistributed in this collection. Review registry commands and licenses before installing or republishing their assets.
