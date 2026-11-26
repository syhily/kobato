# Sayaka style-entry conventions

`apps/sayaka/src/styles/` owns sayaka's single surface Tailwind compilation: `public.css` composes
`@kobato/inkling/styles/cards.css` + the local ui partial (`../ui/styles/public.css`, the dissolved web-public tree,
which composes the kit partial) + local `cursors.css`, scanning `routes`, `root.tsx`, `document`, `rum`, and
`route-warmup`. The same ownership contract as `apps/kobato/src/styles/AGENTS.md` applies: one compile per surface,
partials own their `@source`, the entry takes `@kobato/ui/styles/tailwind.css` as reference plus the emitted
`base-defaults.css`, and route modules import only `@sayaka/styles/public.css` — never cards.css, web partials, or
`ui.css`. The compiled sheet is pinned byte-identical to kobato's public sheet while the copy-first split stands
(`apps/kobato/tests/arch/tailwind-compile-contract.test.ts`).
