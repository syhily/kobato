# App style-entry conventions

`apps/kobato/src/styles/` owns the app's two surface Tailwind compilations. Every package owns only its own `@source`
partial; a surface runs exactly one Tailwind compile composing those partials via CSS `@import`. Cross-package `@source`
is forbidden by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts` (which also pins: partials carry no
`@import 'tailwindcss'`, no module imports them directly).

- `admin.css` composes `@kobato/inkling/styles/cards.css` + `@kobato/web-public/styles/admin-subset.css` +
  `@kobato/web-admin/styles/admin.css`, scanning `routes/admin`, `routes/auth`, `routes/editor`, `root.tsx`.
  `public.css` composes cards + `@kobato/web-public/styles/public.css` + local `cursors.css`, scanning `routes/public` +
  `root.tsx`.
- Both entries take `@kobato/ui/styles/tailwind.css` as a `reference` compile contract (tokens and the UI-owned `dark`
  variant affect the compile, nothing emits) and import `@kobato/ui/styles/base-defaults.css` non-reference — every
  sheet must carry the base-layer border default after its own preflight. Product utilities must use named theme tokens
  (`max-w-admin`, `text-admin-sm`), never `(--token)` arbitrary syntax — a var reference into a reference-imported theme
  emits nothing. `apps/kobato/tests/arch/tailwind-compile-contract.test.ts` compiles every entry for real.
- UI `ui.css` is the document's single global entry: `root.tsx` imports it eagerly, once per document — an overriding
  product rule wins the cascade on source order, never `!important`. Never add `ui.css` to a route module or lazy
  branch.
- Route modules and components import only `@/styles/admin.css` or `@/styles/public.css` — never cards.css, web
  partials, or ui.css. Route-local classes go in the owning app entry; never add downstream package paths here — extend
  that package's own partial.
