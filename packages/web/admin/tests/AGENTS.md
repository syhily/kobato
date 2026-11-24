# Web-admin test conventions

`packages/web/admin/tests/` mirrors `src/ui/`: `src/ui/posts/PostRow.tsx` → `tests/unit/ui/posts/post-row.test.tsx`.

- `tests/{unit,snaps}/` run inside the `web-unit` / `web-snaps` projects (no vitest config here). The shared web setup
  wrappers live in `tests/utils/setup/` because they own the admin-wide settings-mutation mock.
- Cross-leaf contract pins live in `apps/kobato/tests/arch/`, never here.
- Helpers: generic utilities from `@kobato/test`; the SSR render helper from
  `@kobato/web-client/tests/utils/render.tsx`; i18n render helpers from `@kobato/ui/tests/utils/{i18n-render,hook}.tsx`;
  product fixtures (blog-settings/i18n/catalog/lexical) from their canonical packages. The `@kobato/ui` dialog stub used
  by the snap suites stays leaf-local as `tests/utils/dialog.tsx`.
