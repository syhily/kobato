# App test conventions

Test trees for the deployable app, plus the cross-package architecture guards and the two live-instance suites. In Vitest trees import app source through `@/...` and app-test helpers through `@tests/...`; React Router's generated `./+types/*` stays relative. The Playwright journey tree is the one runner-level exception: Playwright loads its config/support files before any tsconfig-path resolver, so those local imports stay relative.

## Layout

- **`tests/{unit,it,snaps}/`** (`app-unit`, `app-it`, `app-snaps`) — route-module tests mirroring `apps/kobato/src/routes/`.
- **`tests/arch/`** — the architecture/contract guards (package DAG, client-bundle, i18n boundaries, log-message literals); runs inside `app-unit`.
- **`duckdb`** (`tests/vitest.duckdb.config.ts`) — every test file that spins up the real DuckDB native engine, wherever it lives. Membership is owned by `@kobato/test/duckdb-files.ts` and pinned by `tests/arch/duckdb-project-files.test.ts`; files run in parallel on the threads pool with per-file isolation — each file builds its own throwaway DuckDB database, and the native engine is thread-safe. Run with `pnpm test:duckdb`.
- **`tests/e2e/`** — true HTTP e2e over a real kobato instance (the SEA binary booted by `tools/pack/src/sea/e2e.ts`) via plain `fetch`. No in-process shortcuts, no `vi.mock`. **Not part of `pnpm test`**; run `pnpm run sea:e2e`, which injects the `KOBATO_E2E_BASE_URL` / `KOBATO_E2E_ADMIN_EMAIL` / `KOBATO_E2E_ADMIN_PASSWORD` env contract plus `KOBATO_E2E_DATABASE` (the throwaway SQLite path) as the one sanctioned seam for state no HTTP surface can stage — use it only when no admin RPC exists, and always restore what you flip. Mail never leaves the machine: mail journeys point the `mail` settings at the in-process SMTP capture server in `@kobato/harness/smtp.ts` and extract secrets from the captured bytes.
- **`tests/browser/`** — real-Chromium journeys (Playwright) for behavior jsdom cannot prove (sidebar edge alignment, toolbar sizing, the settings language switch, locale-change retention, cold-load popups, the comment composer's label chunk, `contentLanguage` DOM contract).
  - Spec/support files import each other through the `@tests/browser/...` alias, resolved by the tree's own `tsconfig.json` — which extends the shared base **by relative path**, because Playwright's loader only looks for `node_modules/<specifier>` beside the config.
  - The Playwright config lives in `tools/browser/playwright.config.ts`. **Not part of `pnpm test`**; `pnpm run test:browser` boots a throwaway instance or targets `KOBATO_BROWSER_BASE_URL`; `pnpm run sea:browser [binary]` always boots the built binary (exits non-zero when the binary is missing — never a silent skip).
  - Runner env: `KOBATO_BROWSER_BASE_URL` + `KOBATO_BROWSER_ADMIN_EMAIL` / `_PASSWORD` / `_POST_SLUG`; `global-setup.ts` stages one published post and resets the settings baseline through the admin HTTP surface — never point an external target at production. One worker, files serial. Local runs default to the system Google Chrome channel; `KOBATO_BROWSER_CHANNEL` overrides; CI installs `chromium`.

Cross-cutting integration tests live inside the owning package's `tests/it/` under the primary domain they exercise — there is no `features/` bucket.

## Running

```bash
npx vitest run --project duckdb
pnpm run test:browser                 # managed throwaway instance by default
pnpm run sea:browser dist-sea/kobato  # always the SEA binary
KOBATO_BROWSER_HEADLESS=0 pnpm run test:browser
```

Artifacts and the HTML report land under the ignored `tmp/`.

## CI

GitHub Actions needs no service containers — the suite is self-contained. Real-browser journeys are separate from `pnpm test`: `ci.yml`'s `build` job runs `sea:build` + `sea:browser` on **pull_request** events only; `sea.yml` runs the same journeys from its build jobs. Both install Chromium with `pnpm --filter @kobato/browser exec playwright install --with-deps chromium`.
