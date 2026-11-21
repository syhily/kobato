# Inkling test conventions

- **`tests/`** (`inkling-unit` / `inkling-iso-unit`) — the inkling editor suite (jsdom, globals off, vmThreads),
  mirroring `packages/inkling/src`. `vitest.config.ts` and `vitest.iso.config.ts` are sibling project configs discovered
  by the root glob: `inkling-unit` excludes the files scanned by `@kobato/test/mock-files.ts`, and those module-level
  `vi.mock(` holders run isolated in `inkling-iso-unit`. Run `pnpm test:inkling`.
- `tests/setup.ts` wraps `@kobato/test/setup/unit.ts` (jest-dom, cleanup, timer restore) plus the inkling-only jsdom
  fallbacks — the shared `installWebStreamGlobals()` web-stream shim, then DOMParser, ResizeObserver,
  IntersectionObserver, and the in-memory `localStorage`.
- Layout: `tests/unit/...` mirrors `src/` for `*.test.*` files; `tests/utils/` holds HELPERS ONLY (`test-editor.ts`,
  `render-live.ts`, fixtures) and never a `*.test.ts`. Tree-specific helpers sit beside their tree
  (`tests/nodes-base/test-helpers.ts`), never in a nested `test-utils/` directory or an `index.ts` barrel.
- `tests/utils/lexical.ts` is the WORKSPACE-canonical Lexical document-model fixture: `@kobato/web-client`,
  `@kobato/web-admin`, and the app's test trees import it cross-package (the one sanctioned `@kobato/inkling/tests/*`
  deep import, pinned by `apps/kobato/tests/arch/package-dag.test.ts`); `@kobato/test` stays product-free
  infrastructure. Import helpers through `@kobato/inkling/tests/utils/...`; production internals use the private
  `@kobato/inkling-internal/...` alias rather than relative traversal.
