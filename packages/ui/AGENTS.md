# UI module conventions

`@kobato/ui` is Kobato's design-system module. It owns design tokens, base styles, shadcn/Base UI primitives, static icons, theme and i18n providers, and generic presentation hooks. Production sources depend only on the shared leaves they need (`@kobato/settings`, `@kobato/i18n`, `@kobato/utils`), never on web packages or `@kobato/server`. Test helpers live in `packages/ui/tests/utils/`; UI never imports another package's tests.

- `styles/` owns generic token, typeset, and dark-variant partials plus `ui.css`, which compiles and scans only UI sources.
- `components/` contains reusable primitives, not product screens or domain orchestration. A component file never defines or exports a hook — a context/hook pair lives in `lib/` (`lib/sidebar-context.ts`, imported by `components/sidebar.tsx`).
- `icons/` contains static icon exports; use named imports, never runtime name lookups.
- `lib/` is flat and role-prefixed: `use-*.ts` is a hook, `*Provider.tsx` is a provider, `*.ts` is a pure helper (including `logger.ts`, the pino-backed client logger with a pluggable sink). It contains generic presentation utilities and providers: `cn` (token-namespace merge groups), the
  `computePageWindow` pagination-window algorithm shared by the public site and the admin shell,
  `DEFAULT_FONT_STACKS` (the per-locale font map contract-pinned to `styles/tailwind.css`), the infinite-scroll
  sentinel, the debounced-search input helper, and other presentation hooks, and `I18nProvider`/`ThemeProvider`. Browser product state, oRPC, routes,
  and editor glue belong in `@kobato/web-client` / `@kobato/web-admin`.
- Consumers import directly from `@kobato/ui/<path>`; there is no barrel. Imports within this package also use the package root.
- Preserve SSR/hydration parity and the existing lazy-motion facade rules.
