---
name: opentui-tuiparts
description: Build Core, React, or Solid OpenTUI controls with tuiparts behavioral primitives and editable recipes. Use for dialogs, buttons, toggles, tabs, forms, and compound interaction components.
license: MIT
metadata:
  author: opsx-schema
  version: "0.1.0"
---

# tuiparts integration

tuiparts is optional third-party software, not part of `@opentui/core`. Its [primitives](https://tuiparts.sh/docs/primitives/) package difficult interaction behavior; [recipes](https://tuiparts.sh/docs/catalog/) copy editable presentation into the consumer application. Start with a recipe, then change layout, glyphs, density and tokens to meet the brief. Use a primitive directly when behavior must be retained without the recipe API or styling.

## Select the framework first

Recipes for Accordion, Badge, Button, Checkbox, Dialog, Input, Radio Group, Slider, Switch, Tabs, and other controls are offered for Core, React, and Solid. For a React checkbox, the [documented command](https://github.com/tuiparts/tuiparts#start-with-a-recipe) is `pnpm dlx shadcn@4.13.0 add @tuiparts/react/checkbox`; substitute `core` or `solid` for the host binding. The CLI copies source and a consumer-owned theme into `components/ui` and installs dependencies; review its diff before accepting.

For primitives directly, install the matching `@tuiparts/core`, `@tuiparts/react`, or `@tuiparts/solid` package and read its package documentation. React and Solid adapters use Core; the host owns its OpenTUI and framework peers. Do not mix a React recipe into Solid or imply the package magically registers a built-in OpenTUI intrinsic.

## Proof

Test focus, key/mouse interaction, disabled and error states, terminal width, overlay dismissal, and renderer teardown. Run registry `view`/`diff` before updating copied recipes. Cite the exact component and version used. Sources: [repository](https://github.com/tuiparts/tuiparts), [registry guide](https://tuiparts.sh/docs/registry/).
