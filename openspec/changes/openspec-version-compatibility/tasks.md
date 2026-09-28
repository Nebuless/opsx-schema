## 1. Compatible OpenSpec preflight

- [x] 1.1 Replace `src/openspec/client.ts` exact-version gate with stable 1.x >=1.12.0 support; reject old, malformed, and unsupported major versions with actionable errors.
- [x] 1.2 Add focused version-policy tests for the minimum boundary, current and later 1.x, old, malformed, and major-version cases.

## 2. Schema mutation safety

- [x] 2.1 Await switch/validation preflight and block schema install before writes when OpenSpec is unsupported.
- [x] 2.2 Verify older-version CLI paths return a structured error without writes or an unhandled rejection stack.

## 3. Documentation and live proof

- [x] 3.1 Update README and `docs/commands.md` version guidance; include OpenSpec's official upgrade URL and supported-range boundary.
- [x] 3.2 Exercise actual OpenSpec 1.13.2 switch preview, targeted regressions, OpenSpec validation, and independent read-only review.
