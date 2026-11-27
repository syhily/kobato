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
- The comment surface (`tests/unit/comment/`) is driven through its public `@kobato/inkling/comment/*` specifiers. Tests
  that mount a provider-wrapped component use `wrapWithI18n` from `@kobato/ui/tests/utils/i18n-render` (the UI package's
  canonical helper); a props-binding test mocks `InklingComposer` / `InklingSurface` through the private alias rather
  than mounting a live editor, and stubs `window.matchMedia` for `ThemeProvider` (jsdom ships none). The card-rendering
  spec (`CommentBodyEditor.cards.test.tsx`) mounts the live composer and must NOT import `tests/utils/test-editor.ts` —
  that helper's top-level `registerCardDecorateAdapter()` would mask the comment entry's own registration.
- `tests/utils/lexical.ts` is the WORKSPACE-canonical Lexical document-model fixture: this package's own tests and the
  kobato app test trees (`apps/kobato/tests/unit`, `apps/kobato/tests/snaps`) import it — for the app trees the one
  sanctioned `@kobato/inkling/tests/*` deep import, pinned by `apps/kobato/tests/arch/package-dag.test.ts`. Import
  helpers through `@kobato/inkling/tests/utils/...`; production internals use the private `@kobato/inkling-internal/...`
  alias rather than relative traversal.
