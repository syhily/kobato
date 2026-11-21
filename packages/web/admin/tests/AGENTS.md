# Web-admin test conventions

`packages/web/admin/tests/` holds the admin leaf's suites, mirroring `src/ui/`: `packages/web/admin/src/ui/posts/PostRow.tsx` → `packages/web/admin/tests/unit/ui/posts/post-row.test.tsx`.

- **`tests/{unit,snaps}/`** run inside the umbrella `web-unit` / `web-snaps` projects rooted at `packages/web/tests` (see `packages/web/tests/AGENTS.md`); there is no separate vitest config here.
- Cross-leaf contract pins (tests importing more than one web leaf) stay in the umbrella's `packages/web/tests/{unit,contract}` — never here, so a cross-leaf pin cannot force a reverse package dependency.
- Generic utilities (query mocks) come from `@kobato/test` (see `tools/test/AGENTS.md`); the SSR render helper is imported from `@kobato/web-client/tests/utils/render.tsx`, and product fixtures (blog-settings/i18n/catalog/lexical) from their canonical packages — cross-package `tests/utils` imports. The `@kobato/ui` dialog stub used by the snap suites stays leaf-local as `tests/utils/dialog.tsx`.
