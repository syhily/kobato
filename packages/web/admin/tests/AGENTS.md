# Web-admin test conventions

`packages/web/admin/tests/` holds the admin leaf's suites, mirroring `src/ui/`:
`packages/web/admin/src/ui/posts/PostRow.tsx` → `packages/web/admin/tests/unit/ui/posts/post-row.test.tsx`.

- **`tests/{unit,snaps}/`** run inside the `web-unit` / `web-snaps` projects defined in `tools/test/src/projects/`;
  there is no separate vitest config here. The shared web setup wrappers live in `tests/utils/setup/` because they own
  the admin-wide settings-mutation mock.
- Cross-leaf contract pins live in `apps/kobato/tests/arch/`, never here, so a cross-leaf pin cannot force a reverse
  package dependency.
- Generic utilities (query mocks) come from `@kobato/test` (see `tools/test/AGENTS.md`); the SSR render helper is
  imported from `@kobato/web-client/tests/utils/render.tsx`, the i18n render helpers from
  `@kobato/ui/tests/utils/{i18n-render,hook}.tsx`, and product fixtures (blog-settings/i18n/catalog/lexical) from their
  canonical packages — cross-package `tests/utils` imports. The `@kobato/ui` dialog stub used by the snap suites stays
  leaf-local as `tests/utils/dialog.tsx`.
