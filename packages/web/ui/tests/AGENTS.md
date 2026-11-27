# UI test conventions

- `tests/unit/` (`ui-unit`) covers primitives, generic hooks, providers, the document shell
  (`tests/unit/components/document-shell/`), and style/token contracts plus the API-free rule (`tests/unit/contract/`
  runs in the same project). `tests/snaps/` (`ui-snaps`) covers primitive SSR snapshots (`Image` included). Both are
  defined in `@kobato/test/projects/ui-projects.ts` and run on vmThreads (a fresh VM context per file; `ui-unit` on
  happy-dom). Run with `pnpm test packages/web/ui`.
- Product-component tests live in the consuming surfaces (`apps/kobato/tests/{unit,snaps}/ui`, `apps/sayaka/tests`).
  `tests/utils/i18n-render.tsx` + `tests/utils/hook.tsx` are the canonical i18n render helpers and
  `tests/utils/document-facts.ts` the canonical `DocumentFacts` fixture (`TEST_DOCUMENT_FACTS`, `documentFactsFor`) —
  the web leaves and the apps import them cross-package; a test rendering a module that reads document facts mounts
  `DocumentFactsProvider` (or the shell) above it. Generic infrastructure comes from `@kobato/test`.
