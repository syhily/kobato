# UI module conventions

`@kobato/ui` is Kobato's design-system module. It owns design tokens, base styles, shadcn/Base UI primitives, static icons, theme and i18n providers, and generic presentation hooks. It depends on `@kobato/shared`, never on `@kobato/web` or `@kobato/server`.

- `styles/` owns the token cascade and public/admin style entries; see its local conventions.
- `components/` contains reusable primitives, not product screens or domain orchestration.
- `icons/` contains static icon exports; use named imports, never runtime name lookups.
- `lib/` contains generic presentation utilities and providers. Browser product state, oRPC, routes, and editor glue belong in `@kobato/web`.
- Consumers import directly from `@kobato/ui/<path>`; there is no barrel. Imports within this package also use the package root.
- Preserve SSR/hydration parity and the existing lazy-motion facade rules.
