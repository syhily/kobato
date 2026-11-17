# Inkling test conventions

- **`tests/`** (`inkling`) — the inkling editor suite (jsdom, globals off), mirroring `packages/inkling/src`. Carries its own `vitest.config.ts`; run `npx vitest run --project inkling` (alias `pnpm test:inkling`).
- Helpers live in `tests/utils/` — including the `test-editor.ts` harness that registers the card decorate adapter — NOT in `@kobato/test`. This is the one sanctioned exception to the shared-utilities rule (the editor island stays host-agnostic).
