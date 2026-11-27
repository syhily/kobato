# App style-entry conventions

`apps/kobato/src/styles/` owns the app's single surface Tailwind compilation. Every package owns only its own `@source`
partial; a surface runs exactly one Tailwind compile composing those partials via CSS `@import`. Cross-package `@source`
is forbidden by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts` (which also pins: partials carry no
`@import 'tailwindcss'`, no module imports them directly, and kobato holds exactly one entry).

- `admin.css` composes `@kobato/inkling/styles/cards.css` + `@kobato/web-kit/styles/kit.css` + the app-local admin
  partial (`../ui/styles/admin.css`, a relative import), scanning `routes/admin`, `routes/auth`, `routes/editor`,
  `root.tsx`. `cards.css` is Inkling's product-token partial, composed by every surface: it scans the host cards and the
  comment composer, whose product-token chrome (`border-line`, `border-brand`, `ring-brand/40`) cannot be emitted from
  Inkling's own theme. The public compilation (`public.css` + `cursors.css`) moved to `apps/sayaka` with the public tree
  (ADR-0009).
- The admin partial itself lives in `src/ui/styles/` beside the UI tree it scans: it scans `..` (the whole `src/ui`
  tree) and owns the admin zoom/scrollbar utilities — unlayered host rules only, never a compilation entry (no
  `@import 'tailwindcss'`, no top-level cascade-layer order declaration, no UI reference). The public-surface partials
  live in the sayaka app. The `dark` variant stays UI-owned: partials must not re-declare `@custom-variant`.
- `src/ui/styles/inkling-editor.css` is imported with Inkling's own `index.css` by `PageBodyEditor`; the comment canvas
  twin is Inkling's `styles/comment-editor.css`, imported by `@kobato/inkling/comment/CommentBodyEditor`. The page
  canvas uses `zoom: 2/3`, token/spacing bridges, and host-card token restores; the comment canvas has no zoom (it
  breaks contenteditable IME painting). Inkling owns its own preflight, dark variant, layer, utilities, and source scan:
  never import Inkling's sheet through another Tailwind compile and never scan Inkling sources (the one sanctioned
  surface scan of Inkling code is `cards.css`, which lives in Inkling). Contracts:
  `apps/kobato/tests/arch/editor-canvas-scope.test.ts`, `editor-host-card-tokens.test.ts`,
  `tailwind-source-ownership.test.ts`.
- The entry takes `@kobato/ui/styles/tailwind.css` as a `reference` compile contract (tokens and the UI-owned `dark`
  variant affect the compile, nothing emits) and imports `@kobato/ui/styles/base-defaults.css` non-reference — the sheet
  carries the base-layer border default after its own preflight. Product utilities use named theme tokens
  (`max-w-admin`, `text-admin-sm`), never `(--token)` arbitrary syntax — a var reference into a reference-imported theme
  emits nothing (`apps/kobato/tests/arch/tailwind-compile-contract.test.ts` compiles every entry for real).
- UI `ui.css` is the document's single global entry: `root.tsx` imports it eagerly, once per document; an overriding
  product rule wins the cascade on source order, never `!important`. Never add `ui.css` to a route module or lazy
  branch.
- Route modules and components import only `@/styles/admin.css` — never cards.css, web partials, or ui.css. Route-local
  classes go in the app entry; never add downstream package paths here — extend that package's own partial.
