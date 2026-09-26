---
name: opentui-termcn
description: Select, install, theme, and adapt termcn's third-party OpenTUI React components, charts, and templates. Use only when a React OpenTUI app needs termcn registry recipes.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# termcn for OpenTUI React

termcn is an optional, editable-source registry—not the OpenTUI built-in API. Its catalog also has **Ink** variants: select the `/opentui/` documentation and registry namespace, never copy an Ink `<Text>` example into an OpenTUI app. Start with the [OpenTUI catalog](https://www.termcn.dev/docs/components/opentui) and [registry guide](https://www.termcn.dev/docs/registry).

## Choose and inspect

Browse layout, typography, inputs, selection, data, feedback, navigation, overlays, forms, utility, and AI components; the site also lists charts, templates, and themes. Select the smallest recipe that covers the request. Before installing, read its component page for props and dependencies and inspect the registry item/source. Check that the target app has a working `@opentui/react` root and compatible versions.

## Install consciously

Registry alias in `components.json`: `"@termcn": "https://termcn.dev/r/{name}.json"`. Example: `pnpm dlx shadcn@latest add @termcn/opentui/spinner`. Without the alias, use `https://termcn.dev/r/opentui/spinner.json`. This **writes project source/dependencies** under configured paths; review the diff, imports, peer dependencies and any supplied license terms. Components typically land in `components/ui/`; optional providers in `providers/`, themes in `lib/terminal-themes/`. Never install a provider merely because a component exists.

## Verify

Use the installed source as the import authority, not a generic Ink example. Exercise actual focus, narrow layout, colors, and terminal cleanup. Compare with [tuiparts](https://github.com/tuiparts/tuiparts) when packaged interaction behavior is more important than a broad editable catalog. Source: [shadcn-labs/termcn](https://github.com/shadcn-labs/termcn) (repository MIT; audit any separately licensed assets before redistribution).
