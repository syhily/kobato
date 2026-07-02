# Vendored inkling editor source

This directory is a vendored copy of the external inkling editor project.
It is yufan.me-owned from this point on (modified in place), but kept close
to upstream so future re-vendoring diffs stay reviewable.

## Provenance

- Upstream: `/Users/YufanSheng/Developer/xiaoyu/inkling` (`@inkling/editor`, MIT)
- Version: `1.8.3`
- Commit: `e76a86cda0a2a99d598e3941600f83f80b604694` (2026-06-26T15:18:09+08:00)
- Copied: 2026-07-02, `src/` only (no `test/`, `demo/`, `.storybook/`,
  `*.stories.tsx`, `utils/storybook/`)
- Lexical: `0.13.1` (the whole app is aligned to this version)

## Tooling exemptions

- `oxlint.config.ts` ignores this tree (vendored code is not held to app
  lint conventions).
- `tests/unit/shared/contracts/boundaries.test.ts` skips the
  `inkling-editor` directory for the same reason.
- `oxfmt` DOES format this tree (one-time churn accepted; we own the fork).

## Local modifications (marked `// yufan.me:` where inline)

1. All `'@/…'` imports rewritten to `'@/ui/inkling-editor/…'` (1100 refs,
   mechanical).
2. `vite-env.d.ts` trimmed: `vite/client`, `*.svg?react`, `__APP_VERSION__`
   now come from `src/env.d.ts` (+ `vite-plugin-svgr/client`).
3. TS1484 sweep: `type` modifiers added to type-only imports
   (`verbatimModuleSyntax`), 34 specifiers across 14 files, mechanical.
4. `components/ui/LinkInput.tsx` — React 19 `onInput` event typing
   (`currentTarget` instead of annotated `ChangeEvent`).
5. `unsplash/ui/UnsplashGallery.tsx` — `galleryRef` prop widened to
   `RefObject<HTMLDivElement | null>` (React 19 `useRef` typing).

6. All `rem` values in `*.tsx` arbitrary Tailwind classes and in
   `styles/preflight.css` + `styles/components/*.css` rescaled ÷1.6 (Ghost's
   10px-root convention → the app's 16px default root; 27 files, mechanical).
7. `styles/index.css` emptied — the adapted editor stylesheet lives at
   `src/styles/inkling/editor-vendor.css` (see the comment in the file for
   why the upstream sheet must not load).

Later tasks append here.
