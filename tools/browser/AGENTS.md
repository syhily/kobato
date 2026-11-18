# `@kobato/browser`

The real-browser Playwright journey runner (`test:browser`, `sea:browser`).

- `src/cli.ts` — command surface; `src/run.ts` — journey orchestration; `src/sea.ts` — the SEA-binary variant.
- Journeys are authored in `apps/kobato/tests/browser/`; this package only boots instances, drives the browser, and reports. It may import product packages; product `src/` never imports it.
