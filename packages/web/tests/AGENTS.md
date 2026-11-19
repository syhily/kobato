# Web test conventions

`packages/web/tests/` holds the umbrella Vitest roots, their product-coupled setup wrapper and fixture copies, and cross-leaf contract tests for `@kobato/web-client`, `@kobato/web-public`, and `@kobato/web-admin`. It is not a production package.

- `package.json` is the private, tests-only `@kobato/web-tests` manifest: it supplies dependency resolution for cross-leaf tests and declares no source surface. Production code must not import it.
- Leaf suites live in `packages/web/{client,public,admin}/tests/{unit,snaps}` and mirror their owning `src/` trees. Cross-leaf contract pins stay here; a test that imports sibling leaves must not force a reverse package dependency.
- `tests/unit/vitest.config.ts` (`web-unit`) anchors at the repository root and includes all three leaf unit trees plus this directory's `unit/` and `contract/`. `tests/snaps/vitest.config.ts` (`web-snaps`) does the same for snapshots.
- Examples: `contract/lexical-node-whitelist.test.ts` pins both composers against `@kobato/inkling/headless`; `unit/client/editor/use-editor-body-reset.test.ts` pins the client reset hook against the public comment composer.
- Run with `npx vitest run --project web-unit` / `--project web-snaps`. Filters resolve from the repository root, for example `npx vitest run --project web-unit packages/web/admin/tests/unit/`.
- Generic infrastructure (query mocks, dialog stubs, `vitest.define`) comes from `@kobato/test`; cross-leaf render/data fixtures live in this package's `utils/`, and the three leaves keep their own copies under their own `tests/utils/`.
