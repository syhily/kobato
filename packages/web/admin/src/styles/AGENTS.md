# Web-admin style conventions

`packages/web/admin/src/styles/` owns the ADMIN Kobato-specific style adapters: the admin `@source` partial and the
page-editor host rules. The public-surface partials live in the public leaf. Every file here scans only
`packages/web/admin`.

- `admin.css` is a partial, not a compilation entry: no `@import 'tailwindcss'`, no top-level cascade-layer order
  declaration, no UI reference — the consuming surface entry (`apps/kobato/src/styles/admin.css`) runs the single
  Tailwind compile and composes it via CSS `@import` next to `@kobato/web-public/styles/admin-subset.css` (which scans
  the public/shared/lib subset admin renders as a long-term seam). `admin.css` scans `../ui` and owns the admin
  zoom/scrollbar rules. Each partial's exact `@source` set is pinned by the required-scan map in
  `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.
- The `dark` variant stays UI-owned: partials must not re-declare `@custom-variant`.
- `inkling-editor.css` is imported with Inkling's own `index.css` by `PageBodyEditor`; the comment canvas twin
  (`inkling-comment-editor.css`) lives with the comment composer in `packages/web/public/src/styles/`. This package owns
  only unlayered host rules.
- The page canvas uses `zoom: 2/3`, token/spacing bridges, and host-card token restores. The comment canvas has no zoom
  because it breaks contenteditable IME painting.
- Inkling owns its own preflight, dark variant, layer, utilities, and source scan. Web-admin never imports Inkling's
  sheet through another Tailwind compile and never scans Inkling sources.
- Contracts: `apps/kobato/tests/arch/editor-canvas-scope.test.ts`, `editor-host-card-tokens.test.ts`, and
  `tailwind-source-ownership.test.ts`.
