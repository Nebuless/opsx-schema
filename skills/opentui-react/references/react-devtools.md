# React DevTools

**Canonical:** https://opentui.com/docs/bindings/react/#react-devtools

## When to use

Use React DevTools to inspect React component tree, props, and state while diagnosing reconciliation or effect behavior. It does not inspect Core layout, render frames, terminal protocols, or native renderer state.

## Setup

Install optional development dependencies in target project, then start DevTools before target process:

```bash
bun add --dev react-devtools-core@7
npx react-devtools@7
DEV=true bun run your-app.ts
```

OpenTUI loads DevTools support dynamically when `DEV=true`. React package marks `react-devtools-core` and `ws` optional peers; do not make runtime app behavior depend on either.

## Lifecycle and pitfalls

- DevTools connection is process-local diagnostic infrastructure. Do not ship it as required production behavior.
- `DEV=true` enables a development-only dynamic import. Verify its package availability before relying on it.
- Use Core `TestRenderer`, renderer diagnostics, and captured frames for terminal geometry or rendering problems; React tree inspection alone cannot prove terminal output.
- Do not expose a remote debugging endpoint on untrusted networks. DevTools can reveal component data and application state.

## Canonical sources

- [React bindings DevTools setup](https://opentui.com/docs/bindings/react/#react-devtools)
- [React devtools initializer](https://github.com/anomalyco/opentui/blob/main/packages/react/src/reconciler/devtools.ts)
- [React package peers](https://github.com/anomalyco/opentui/blob/main/packages/react/package.json)
