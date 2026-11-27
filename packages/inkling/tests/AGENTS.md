# Inkling test conventions

- `tests/` (`inkling-unit`) is the single inkling suite (jsdom, globals off, vmThreads) and mirrors
  `packages/inkling/src` under `tests/unit/`. The project is built by the `inklingUnitProject` factory in
  `@kobato/test/projects/inkling-unit.ts` (which owns the include glob) and instantiated by `tests/vitest.config.ts` —
  the only package-local Vitest config, because it owns the React/SVGR Vite plugins; the root registry references that
  config by path. Run `pnpm test:inkling`.
- `tests/setup.ts` wraps `@kobato/test/setup/dom` (jest-dom, cleanup) and adds the inkling-only jsdom fallbacks: the
  shared `installWebStreamGlobals()` shim, then DOMParser, ResizeObserver, IntersectionObserver, and the in-memory
  `localStorage`.
- Layout: `tests/unit/...` mirrors `src/` for `*.test.*` files. `tests/utils/` holds HELPERS ONLY (`test-editor.ts`,
  `render-live.ts`, fixtures), never a `*.test.ts`. Tree-specific helpers sit beside their tree
  (`tests/unit/nodes/base/test-helpers.ts`, `tests/unit/transforms/test-helpers.ts`) — never a nested `test-utils/`
  directory or an `index.ts` barrel.
- `tests/utils/lexical.ts` is the WORKSPACE-canonical Lexical document-model fixture: `@kobato/web-kit` and the app test
  trees import it cross-package (the one sanctioned `@kobato/inkling/tests/*` deep import, pinned by
  `apps/kobato/tests/arch/package-dag.test.ts`). Import helpers through `@kobato/inkling/tests/utils/...`; production
  internals use the private `@kobato/inkling-internal/...` alias rather than relative traversal.
