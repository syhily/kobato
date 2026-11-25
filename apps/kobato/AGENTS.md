# Kobato app

`apps/kobato` is the deployable React Router 8 Framework Mode app (`appDirectory: 'src'`, SSR). It wires routes to
product code and owns nothing reusable: UI in `@kobato/web-*`/`@kobato/ui`, backend in `@kobato/server`, contracts in
`@kobato/api`.

- `src/root.tsx`, `src/routes.ts`, `src/entry.server.tsx`, `src/server.ts` — the framework entry set (`server.ts` is
  resolved by `@kobato/server/infra/hono/dev.ts`); `src/zod-config.ts` must be imported first, before any schema
  evaluates.
- `src/routes/` — four surface trees (`public/`, `auth/`, `admin/`, `editor/`); see `src/routes/AGENTS.md`. Route
  modules wire loader/action data to controllers and render; no business logic, no DB imports.
- `src/seo/` — the typed route-meta factory over `@kobato/catalog/seo` builders (app-owned because it feeds the `meta`
  route export).
- `src/styles/` — app-owned Tailwind entries; see `src/styles/AGENTS.md`.
- `tests/` — `arch/`, `unit/`, `it/`, `snaps/`, `browser/`, `e2e/`; see `tests/AGENTS.md`.
- Imports: `@/...` app source, `@tests/...` app test helpers, `@kobato/<package>/...` product code. No relative
  specifiers outside the documented exceptions (root `AGENTS.md`).
- `drizzle-orm` is a tests-only devDependency (seed/assertion code); production source never imports it.
