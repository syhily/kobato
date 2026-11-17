# App test conventions

Test trees for the deployable app, plus the cross-package architecture guards and the two live-instance suites.

## Layout

- **`tests/{unit,it,snaps}/`** (`app-unit`, `app-it`, `app-snaps`) — route-module tests mirroring `apps/kobato/src/routes/`.
- **`tests/arch/`** — the architecture/contract guards (package DAG, client-bundle, i18n boundaries, log-message literals); runs inside `app-unit`.
- **`duckdb`** (`tests/vitest.duckdb.config.ts`) — every test file that spins up the real DuckDB native engine, wherever it lives. Membership is owned by `@kobato/test/duckdb-files.ts` and pinned by `tests/arch/duckdb-project-files.test.ts`; the `unit`/`it` projects exclude the same list. Files run sequentially, each in a fresh fork (`pool: 'forks'` + `fileParallelism: false`), so a native crash kills only its own worker. Run with `pnpm test:duckdb`.
- **`tests/e2e/`** — true HTTP e2e: tests drive a real kobato instance (the SEA binary booted by `packages/tools/pack/src/sea/e2e.ts`) over plain `fetch`. No in-process shortcuts, no `vi.mock`. **Not part of `pnpm test`** (the root config lists projects explicitly); run `pnpm run sea:e2e`, which boots the instance and injects the `KOBATO_E2E_BASE_URL` / `KOBATO_E2E_ADMIN_EMAIL` / `KOBATO_E2E_ADMIN_PASSWORD` env contract, plus `KOBATO_E2E_DATABASE` (the throwaway per-run SQLite path) as the one sanctioned seam for state no HTTP surface can stage (e.g. flipping `user.login_method` for the magic-link journey) — use it only when no admin RPC exists, and always restore what you flip. Mail never leaves the machine: mail journeys point the `mail` settings at the in-process SMTP capture server in `@kobato/test/e2e-mail.ts` and extract secrets (OTP code, signin link) from the captured bytes.
- **`tests/browser/`** — real-Chromium journeys (Playwright) for behavior jsdom cannot prove: admin sidebar edge alignment, toolbar-control sizing, the settings language switch (dirty-card flush veto, Portal focus, cross-tab sparse save), locale-change state retention on a non-settings document, cold-load public popups (no state reset, static flash, or DOM replacement), the public comment composer loading only the active locale's Inkling labels, and a post's `contentLanguage` DOM contract.
  - **Not part of `pnpm test`** and not a Vitest project. `pnpm run test:browser` boots a throwaway SEA instance or targets `KOBATO_BROWSER_BASE_URL`; `pnpm run sea:browser [binary]` always boots the built binary. An external `KOBATO_BROWSER_BASE_URL` target gets the same staged post + settings baseline — never point it at production.
  - Runner env: `KOBATO_BROWSER_BASE_URL` + `KOBATO_BROWSER_ADMIN_EMAIL` / `KOBATO_BROWSER_ADMIN_PASSWORD` / `KOBATO_BROWSER_POST_SLUG`. `support/global-setup.ts` stages one published post (comments enabled, `contentLanguage: 'ar'`) and resets the general settings baseline through the admin HTTP surface — no real config or secret is read.
  - Local runs default to the system Google Chrome channel; `KOBATO_BROWSER_CHANNEL` overrides it and CI installs/sets `chromium`. One worker, files serial: the journeys share one instance whose settings they mutate and restore. `KOBATO_BROWSER_TEST_GREP` narrows a debugging run.
  - The managed runner exits non-zero when `dist-sea/kobato` is missing — never a silent skip; CI uses `sea:browser`, which always requires the built binary.

Cross-cutting integration tests live inside the owning package's `tests/it/` under the primary domain they exercise — there is no `features/` bucket.

## Running

```bash
npx vitest run --project duckdb
pnpm run test:browser                 # managed throwaway instance by default
pnpm run sea:browser dist-sea/kobato  # always the SEA binary
KOBATO_BROWSER_HEADLESS=0 pnpm run test:browser
```

Artifacts (trace / screenshot / video on failure) and the HTML report land in `tmp/browser-results` and `tmp/browser-report` — both under the ignored `tmp/`.

## CI

GitHub Actions needs no service containers — the suite is self-contained. The CI `check` job also typechecks and builds `apps/inkling-demo`, proving Inkling and the demo's independent Tailwind entries. Real-browser journeys are separate from `pnpm test`: `.github/workflows/ci.yml`'s `build` job runs `sea:build` + bundled Chromium + `pnpm run sea:browser` on **pull_request** events only; plain pushes there run just the production build. `.github/workflows/sea.yml` also runs the same journeys from its `build` / `build-develop` jobs. Both install Chromium with `pnpm exec playwright install --with-deps chromium` and set `KOBATO_BROWSER_CHANNEL=chromium`.
