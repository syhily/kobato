# Inkling test conventions

- **`tests/`** (`inkling`) — the inkling editor suite (jsdom, globals off), mirroring `packages/inkling/src`. Carries its own `vitest.config.ts`; run `npx vitest run --project inkling` (alias `pnpm test:inkling`).
- Layout: `tests/unit/...` mirrors `src/` for `*.test.*` files; `tests/utils/` holds HELPERS ONLY (`test-editor.ts`, `render-live.ts`, fixtures) and never a `*.test.ts`. Tree-specific helpers sit beside their tree (`tests/nodes-base/test-helpers.ts`), never in a nested `test-utils/` directory or an `index.ts` barrel.
- Helpers live in `tests/utils/` — including the `test-editor.ts` harness that registers the card decorate adapter. Product-shaped fixtures are package-local everywhere now; `@kobato/test` is product-free infrastructure. Import helpers through `@kobato/inkling/tests/utils/...`; production internals use the private `@kobato/inkling-internal/...` alias rather than relative traversal.
