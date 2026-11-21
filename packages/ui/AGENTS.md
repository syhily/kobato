# UI module conventions

`@kobato/ui` is Kobato's design-system module: design tokens, base styles, shadcn/Base UI primitives, static icons, theme and i18n providers, and generic presentation hooks. Production sources depend only on `@kobato/settings`, `@kobato/i18n`, `@kobato/utils` — never on web packages or `@kobato/server`. UI never imports another package's tests.

- `styles/` owns generic token, typeset, and dark-variant partials plus `ui.css` (`packages/ui/src/styles/AGENTS.md`).
- `components/` contains reusable primitives, not product screens or domain orchestration. A component file never defines or exports a hook — a context/hook pair lives in `lib/`.
- `components/music-player/` is the one sanctioned product-component family (card, lyrics, scrub bar, playback hook, LRC parser): web-public's projected-body hydration and inkling's host-card preview share it. Its behavior/parity tests stay consumer-side.
- `icons/` contains static icon exports; named imports only, never runtime name lookups.
- `lib/` is flat and role-prefixed: `use-*.ts` is a hook, `*Provider.tsx` is a provider, `*.ts` a pure helper (`cn`, `computePageWindow`, `DEFAULT_FONT_STACKS`, `logger.ts`, the infinite-scroll sentinel, …). Browser product state, oRPC, routes, and editor glue belong in `@kobato/web-client` / `@kobato/web-admin`.
- Consumers import directly from `@kobato/ui/<path>`; there is no barrel.
- Preserve SSR/hydration parity and the lazy-motion facade rules.
