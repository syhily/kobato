# `@kobato/browser`

The real-browser Playwright journey runner (`test:browser`, `sea:browser`).

- `src/cli.ts` — command surface; `src/run.ts` — journey orchestration; `src/sea.ts` — the SEA-binary variant;
  `src/browser-env.ts` — the `KOBATO_BROWSER_*` env contract shared with the journeys.
- `playwright.config.ts` lives here, not in the app test tree, so its own imports (`@playwright/test`,
  `@kobato/browser/browser-env`) resolve from this package's `node_modules`; root scripts run it as
  `pnpm --filter @kobato/browser run test:browser` / `sea:browser`, and `run.ts` spawns
  `pnpm --filter @kobato/browser exec playwright test`.
- Journeys are authored in `apps/kobato/tests/browser/`; this package only boots instances, drives the browser, and
  reports. It may import product packages; product `src/` never imports it.
