# App test conventions

Test trees for the deployable app, plus the cross-package architecture guards and the two live-instance suites. Vitest
trees import app source through `@/...` and helpers through `@tests/...` — except the canonical product helpers imported
cross-package: DB/session/mail/request-context from `@kobato/server/tests/utils/`, i18n render from
`@kobato/ui/tests/utils/i18n-render.tsx` (React Router's `./+types/*` stays relative). The Playwright tree is the one
runner-level exception: its config/support imports stay relative because Playwright loads them before any tsconfig-path
resolver.

- **`tests/{unit,it,snaps}/`** — route-module tests mirroring `apps/kobato/src/routes/`. Each tree is one project
  (`app-unit` also runs `tests/arch/`), defined in `@kobato/test/projects/kobato-app-projects.ts` and registered by the
  root `@kobato/test/projects/registry.ts` — there are no package-local Vitest configs and no shared/iso split; every
  project runs `isolate: true`. Unit/it setup wrappers live under `tests/utils/setup/`.
- **`tests/arch/`** — the architecture/contract guards (package DAG, client-bundle, i18n boundaries, log-message
  literals, the Vitest project registry itself); runs inside `app-unit`.
- **DuckDB** — every file that spins up the real DuckDB engine lives in `tests/it/` named `*.duckdb.test.ts`; the suffix
  routes it into the `app-duckdb` project (isolated, on the app `it` setup alone). Membership is by filename — no manual
  file list (pinned by `tests/arch/duckdb-project-files.test.ts`). Run with `pnpm test:duckdb`; the files also run under
  `pnpm test`.
- **`tests/e2e/`** — true HTTP e2e over a real kobato instance (the SEA binary booted by `sea:e2e`) via plain `fetch`.
  No in-process shortcuts, no `vi.mock`. **Not part of `pnpm test`** (its `tests/e2e/vitest.config.ts` is registered
  nowhere); the `KOBATO_E2E_*` env contract is injected, plus `KOBATO_E2E_DATABASE` — the one sanctioned seam for state
  no HTTP surface can stage (use only when no admin RPC exists; always restore). Mail never leaves the machine
  (in-process SMTP capture via `@kobato/harness/smtp.ts`).
- **`tests/browser/`** — real-Chromium Playwright journeys for behavior jsdom cannot prove. Spec/support files import
  through the `@tests/browser/...` alias resolved by the tree's own tsconfig. The Playwright config lives in
  `tools/browser/playwright.config.ts`. **Not part of `pnpm test`**: `pnpm run test:browser` boots a throwaway instance
  or targets `KOBATO_BROWSER_BASE_URL`; `pnpm run sea:browser [binary]` always boots the built binary (exits non-zero
  when missing). Runner env: `KOBATO_BROWSER_BASE_URL` + `KOBATO_BROWSER_{ADMIN_EMAIL,ADMIN_PASSWORD,POST_SLUG}`;
  `global-setup.ts` stages one published post and resets the settings baseline — never point an external target at
  production. One worker, files serial; local runs default to system Chrome, `KOBATO_BROWSER_CHANNEL` overrides, CI
  installs `chromium`.

Cross-cutting integration tests live inside the owning package's `tests/it/` under the primary domain — there is no
`features/` bucket. Artifacts and the HTML report land under the ignored `tmp/`.

```bash
pnpm run test:duckdb
pnpm test apps/kobato/tests/unit apps/kobato/tests/arch
pnpm run test:browser
pnpm run sea:browser dist-sea/kobato
KOBATO_BROWSER_HEADLESS=0 pnpm run test:browser
```
