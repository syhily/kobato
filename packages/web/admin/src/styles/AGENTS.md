# Web-admin style conventions

`packages/web/admin/src/styles/` owns the ADMIN Kobato-specific style adapters — the admin `@source` partial and the
page-editor host rules — as unlayered host rules only; every file scans only `packages/web/admin`. The public-surface
partials live in the public leaf.

- `admin.css` is a partial, not a compilation entry: no `@import 'tailwindcss'`, no top-level cascade-layer order
  declaration, no UI reference. `apps/kobato/src/styles/admin.css` runs the single Tailwind compile and composes it via
  CSS `@import` next to `@kobato/web-kit/styles/kit.css`. `admin.css` scans `../ui` and owns the admin zoom/scrollbar
  rules; each partial's exact `@source` set is pinned by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.
- The `dark` variant stays UI-owned: partials must not re-declare `@custom-variant`.
- `inkling-editor.css` is imported with Inkling's own `index.css` by `PageBodyEditor`; the comment canvas twin lives
  with the comment composer (`packages/web/kit/src/styles/inkling-comment-editor.css`).
- The page canvas uses `zoom: 2/3`, token/spacing bridges, and host-card token restores. The comment canvas has no zoom
  (it breaks contenteditable IME painting).
- Inkling owns its own preflight, dark variant, layer, utilities, and source scan: never import Inkling's sheet through
  another Tailwind compile and never scan Inkling sources.
- Contracts: `apps/kobato/tests/arch/editor-canvas-scope.test.ts`, `editor-host-card-tokens.test.ts`,
  `tailwind-source-ownership.test.ts`.
