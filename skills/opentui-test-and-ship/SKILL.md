---
name: opentui-test-and-ship
description: Verify and ship OpenTUI applications using frame snapshots, input sequences, real PTY inspection, lifecycle checks, and runtime/deployment validation. Use before claiming a TUI works or releasing it.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# Prove the TUI

1. Run typecheck and targeted unit tests; these do **not** prove terminal behavior. Use the [official test renderer](https://opentui.com/docs/core-concepts/testing/) or React `testRender()` for frames, focus and controlled keys. Always destroy test renderers in teardown.
2. Inspect an actual session at narrow and wide sizes (e.g. 80×24 and 120×40). Exercise initial focus, primary task, escape/back, error/empty state, scrolling/resize, and clean exit. Use screenshots or frame text as evidence, not assertion from source alone.
3. For automation, [pilotty](https://github.com/msmps/pilotty) can manage a PTY and capture snapshots/input on supported Unix platforms. It is optional, not a required package or proof of all terminal protocols. A manual exercised session is also valid.
4. Check target [runtime support](https://opentui.com/docs/getting-started/runtime-support/), [deployment](https://opentui.com/docs/ship/deploy/), native assets, images and terminal capabilities when relevant. Test the packaged artifact, not only source entrypoint.
5. Report exact commands, terminal dimensions, observed frames/interaction, shutdown outcome, untested capabilities, and platform. Consult [rendering diagnostics](https://opentui.com/docs/test-and-debug/rendering-diagnostics/) for blank/corrupt output.

Done means evidence covers the user-visible path and terminal restoration; a green build alone is insufficient.
