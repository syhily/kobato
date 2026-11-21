# App test conventions

Test trees for the deployable app, plus the cross-package architecture guards and the two live-instance suites. Vitest trees import app source through `@/...` and helpers through `@tests/...` (React Router's `./+types/*` stays relative). The Playwright tree is the one runner-level exception: its config/support imports stay relative because Playwright loads them before any tsconfig-path resolver.

- **`tests/{unit,it,snaps}/`** (`app-unit`, `app-it`, `app-snaps`) — route-module tests mirroring `apps/kobato/src/routes/`.
- **`tests/arch/`** — the architecture/contract guards (package DAG, client-bundle, i18n boundaries, log-message literals); runs inside `app-unit`.
- **`duckdb`** — every file that spins up the real DuckDB engine, wherever it lives. Membership is owned by `@kobato/test/duckdb-files.ts` (pinned by `tests/arch/duckdb-project-files.test.ts`); parallel threads pool with per-file isolation. Run with `pnpm test:duckdb`.
- **`tests/e2e/`** — true HTTP e2e over a real kobato instance (the SEA binary booted by `sea:e2e`) via plain `fetch`. No in-process shortcuts, no `vi.mock`. **Not part of `pnpm test`**; the `KOBATO_E2E_*` env contract is injected, plus `KOBATO_E2E_DATABASE` — the one sanctioned seam for state no HTTP surface can stage (use only when no admin RPC exists; always restore). Mail never leaves the machine (in-process SMTP capture via `@kobato/harness/smtp.ts`).
- **`tests/browser/`** — real-Chromium Playwright journeys for behavior jsdom cannot prove. Spec/support files import through the `@tests/browser/...` alias resolved by the tree's own tsconfig (extends the shared base by relative path). The Playwright config lives in `tools/browser/playwright.config.ts`. **Not part of `pnpm test`**: `pnpm run test:browser` boots a throwaway instance or targets `KOBATO_BROWSER_BASE_URL`; `pnpm run sea:browser [binary]` always boots the built binary (exits non-zero when missing). Runner env: `KOBATO_BROWSER_BASE_URL` + `KOBATO_BROWSER_{ADMIN_EMAIL,ADMIN_PASSWORD,POST_SLUG}`; `global-setup.ts` stages one published post and resets the settings baseline — never point an external target at production. One worker, files serial; local runs default to system Chrome, `KOBATO_BROWSER_CHANNEL` overrides, CI installs `chromium`.

Cross-cutting integration tests live inside the owning package's `tests/it/` under the primary domain — there is no `features/` bucket. Artifacts and the HTML report land under the ignored `tmp/`.

## Running

```bash
npx vitest run --project duckdb
pnpm run test:browser
pnpm run sea:browser dist-sea/kobato
KOBATO_BROWSER_HEADLESS=0 pnpm run test:browser
```
