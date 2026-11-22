# Inkling test conventions

- **`tests/`** (`inkling-unit`) — the single inkling editor suite (jsdom, globals off, vmThreads, `isolate: true`),
  mirroring `packages/inkling/src` under `tests/unit/`. The project is built by the `inklingUnitProject` factory in
  `@kobato/test/projects/inkling-unit.ts` (which also owns the include glob) and instantiated by
  `tests/vitest.config.ts` — the only package-local Vitest config, because it owns the React/SVGR Vite plugins. The root
  `@kobato/test/projects/registry.ts` references that config by path; there is no shared/iso split and no mock-file
  scanning. Run `pnpm test:inkling`.
- `tests/setup.ts` wraps `@kobato/test/setup/dom` (jest-dom, cleanup) and adds the inkling-only jsdom fallbacks — the
  shared `installWebStreamGlobals()` web-stream shim, then DOMParser, ResizeObserver, IntersectionObserver, and the
  in-memory `localStorage`.
- Layout: `tests/unit/...` mirrors `src/` for `*.test.*` files; `tests/utils/` holds HELPERS ONLY (`test-editor.ts`,
  `render-live.ts`, fixtures) and never a `*.test.ts`. Tree-specific helpers sit beside their tree
  (`tests/unit/nodes/base/test-helpers.ts`, `tests/unit/transforms/test-helpers.ts`), never in a nested `test-utils/`
  directory or an `index.ts` barrel.
- `tests/utils/lexical.ts` is the WORKSPACE-canonical Lexical document-model fixture: `@kobato/web-client`,
  `@kobato/web-admin`, and the app's test trees import it cross-package (the one sanctioned `@kobato/inkling/tests/*`
  deep import, pinned by `apps/kobato/tests/arch/package-dag.test.ts`); `@kobato/test` stays product-free
  infrastructure. Import helpers through `@kobato/inkling/tests/utils/...`; production internals use the private
  `@kobato/inkling-internal/...` alias rather than relative traversal.
