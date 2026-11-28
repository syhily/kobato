# App test conventions

Test trees for the kobato app — the workspace SPA and the backend entry (`apps/kobato/AGENTS.md`) — and the
cross-package architecture guards, plus the two live-instance suites. Vitest trees import app source through `@/...`,
helpers through `@tests/...`, plus the canonical product helpers cross-package (DB/session/mail/request-context from
`@kobato/server/tests/utils/`, the SSR render helper from `@kobato/web-kit/tests/utils/render.tsx`, i18n render from
`@kobato/ui/tests/utils/{i18n-render,hook}.tsx`, and the `DocumentFacts` fixture from
`@kobato/ui/tests/utils/document-facts.ts` for tests that mount their own stack); React Router's `./+types/*` stays
relative. The Playwright tree reaches its shared support through the package as well: `tests/browser/*.spec.ts` import
`@kobato/instance/browser/*`.

- **`tests/{unit,snaps}/`** — tests mirroring `apps/kobato/src/` (`routes/`, `ui/`, `seo/`, `document/`, `lib/`,
  `server/`): `src/ui/posts/filter-fields.ts` → `tests/unit/ui/posts/filter-fields.test.ts`,
  `src/server/client-assets-root.ts` → `tests/unit/server/client-assets-root.test.ts`, the server middlewares the app
  pins → `tests/unit/http/`. Each tree is one project, defined in `@kobato/test/projects/kobato-app-projects.ts`;
  `tests/arch/` is its own `app-arch` project. `app-unit` and `app-snaps` run on vmThreads (a fresh VM context per file,
  worker reused). Unit/snaps setup wrappers live under `tests/utils/setup/` (they import the one settings-mutation mock
  registration, `@tests/utils/settings-mutation-mock`, and own the blog-settings bundle reset; the unit wrapper also
  resets the analytics query executor), `tests/utils/{analytics-state,dialog,settings-mutation-mock}` are the
  workspace-local helpers (the leaf-local `@kobato/ui` dialog stub the snap suites use), and
  `tests/utils/{context,orpc-client-mock}.ts` are the route-context stubs the `it` tree shares. DOM-rendering tests
  declare their environment per file (`@vitest-environment happy-dom` / `jsdom` — the projects default to node), and the
  runtime-`TZ` write test (`unit/ui/analytics/time-labels.test.ts`) runs alone in the `app-tz-unit` forks project —
  never under `app-unit`.
- **`tests/it/`** — the route-level integration trees (`routes/auth/*`, `routes/admin/*`, `post-analytics-parity`) that
  drive the workspace route modules' `clientLoader` / `clientAction` (`@/routes/...`) against a real database through
  `@kobato/server`'s test harnesses, behind `setup/it.ts` (the Node base, the blog-settings bundle reset, the analytics
  executor reset, and the setup-token reset). `app-it` and `app-duckdb` keep `isolate: true` because every file boots a
  server perimeter.
- **`tests/arch/`** — the architecture/contract guards (package DAG — declared imports, src targets, the
  `pack → instance → test` direction, and the workspace dependency graph acyclic across `dependencies` /
  `devDependencies` / `optionalDependencies`; the module-level value-import cycle scan over every package's `src/**`
  (`module-cycles.test.ts`, specifiers resolved through the tsconfig path table and the package wildcard-export
  convention, Tarjan components printed as concrete paths); the client tree's browser safety (`web-direction.test.ts`)
  and the intra-app feature graph (`admin-feature-graph.test.ts`); client bundle, i18n boundaries, log-message literals,
  the Tailwind compile and source-ownership contracts, the Vitest project registry itself) spanning every package; runs
  in `app-arch` on the product-free Node setup.
- **DuckDB** — every file that spins up the real DuckDB engine lives in `tests/it/` named `*.duckdb.test.ts`; the suffix
  routes it into the `app-duckdb` project. Membership is by filename, never a manual list (pinned by
  `tests/arch/duckdb-project-files.test.ts`). Run with `pnpm test:duckdb`; the files also run under `pnpm test`.
- **`tests/e2e/`** — true HTTP e2e over a real kobato+sayaka pair (the two SEA binaries booted by `sea:e2e`) via plain
  `fetch`; the admin/auth/workspace surfaces talk to kobato's origin directly, and every public-document check (`/`,
  `/posts/…`, feeds) goes through sayaka's origin. No in-process shortcuts, no `vi.mock`. **Not part of `pnpm test`**;
  the `KOBATO_E2E_*` env contract is injected — `KOBATO_E2E_BASE_URL` (kobato origin, backend-direct),
  `KOBATO_E2E_PUBLIC_URL` (sayaka origin, browser-facing), admin email/password — plus `KOBATO_E2E_DATABASE`, the one
  sanctioned seam for state no HTTP surface can stage (use only when no admin RPC exists; always restore). Mail never
  leaves the machine. The HTTP / oRPC helpers (`E2eClient`, `bootstrapCsrfToken`, `loginAdmin` + the `AuthFlowOutput`
  answer, `callE2eRpc`) come from `@kobato/instance/client`. Signin is the oRPC auth flow: bootstrap CSRF →
  `account.auth.login` → `{ type: 'redirect' | 'error' | 'success' }` — there is no document form POST.
- **`tests/browser/`** — real-browser Playwright journeys for behavior jsdom cannot prove; admin/editor/settings
  journeys only, since the public-site journeys live in `apps/sayaka/tests/browser` (ADR-0009). Spec files import the
  SHARED journey support from `@kobato/instance/browser/{fixtures,journey,settings-api}` — the per-tree `support/` copy
  is gone; the Playwright config lives in `tools/instance/playwright.config.ts` (two projects, one booted pair,
  `baseURL` = the sayaka origin; the workspace and public journeys both reach the admin through sayaka's forwarded
  `/admin/*` + `/rpc/*` families). **Not part of `pnpm test`**: `pnpm run test:browser` boots a throwaway pair or
  targets `KOBATO_BROWSER_BASE_URL` (the sayaka origin); `pnpm run sea:browser [kobato-binary]` always boots the built
  pair (exits non-zero when missing). Browsers: the bundled Chromium unless `KOBATO_BROWSER_CHANNEL` names another
  channel — set `KOBATO_BROWSER_CHANNEL=chrome` to drive the installed Google Chrome without downloading anything. One
  worker, files serial; never point an external target at production.

Cross-cutting integration tests live inside the owning package's `tests/it/` under the primary domain — there is no
`features/` bucket. Cross-leaf contract pins live in `tests/arch/`, never beside the moved trees. Artifacts and the HTML
report land under the ignored `tmp/`.

```bash
pnpm run test:duckdb
pnpm test apps/kobato/tests/unit apps/kobato/tests/arch
pnpm run test:browser
pnpm sea:browser dist-sea/kobato
```
