# UI module conventions

`@kobato/ui` is the design system: design tokens, base styles, shadcn/Base UI primitives, static icons, theme and i18n
providers, and generic presentation hooks. Production sources depend only on `@kobato/settings`, `@kobato/i18n`,
`@kobato/utils` — never `@kobato/web-kit`, the apps' UI trees (`apps/kobato/src/ui`, `apps/sayaka/src/ui`), or
`@kobato/server`.

- `styles/` owns the generic token, typeset, and dark-variant partials plus `ui.css` (`src/styles/AGENTS.md`).
- `components/` contains reusable primitives, not product screens or domain orchestration; a component file never
  defines or exports a hook — a context/hook pair lives in `lib/`.
- `components/music-player/` is the one sanctioned product-component family (card, lyrics, scrub bar, LRC parser); the
  family is shared by sayaka's projected-body hydration and inkling's host-card preview. SSR fallback parity stays
  pinned consumer-side.
- `lib/use-music-players.tsx` holds the projected-body hydration hook that mounts `MusicPlayerCard` onto
  `.aplayer[data-*]` mount points over `safeMediaSrc`-gated URLs, with its unit tests under `tests/unit/lib/`.
- `icons/` holds static icon exports; named imports only, never runtime name lookups.
- `lib/` is flat and role-prefixed: `use-*.ts` is a hook, `*Provider.tsx` a provider, `*.ts` a pure helper —
  `lib/motion.ts` holds the motion presets consumers pass to the `lazy-motion` facade. Browser product state and routes
  belong in the apps (`apps/kobato/src/ui` / `apps/sayaka`), editor glue in `@kobato/inkling`; the oRPC binding is
  `@kobato/api/browser`.
- Consumers import directly from `@kobato/ui/<path>`; there is no barrel.
- Preserve SSR/hydration parity and the lazy-motion facade rules.
