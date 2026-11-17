# App style-entry conventions

`apps/kobato/src/styles/` owns only app-route Tailwind compilation and app-specific CSS. Every package compiles and scans its own stylesheet; cross-package `@source` is forbidden by `apps/kobato/tests/arch/tailwind-source-ownership.test.ts`.

- `public.css` scans `routes/public` and `root.tsx`, and imports local `cursors.css`. `admin.css` scans admin/auth/editor routes and `root.tsx`.
- Both entries use `@kobato/ui/styles/tailwind.css` as a `reference` compile contract, so token rules are emitted only by UI's own `ui.css`.
- Public composition imports UI `ui.css`, shared `cards.css`, app `public.css`, and web `public.css` through `BaseLayout`. Admin/auth/editor composition imports UI, shared cards, web `admin.css`, and app `admin.css` independently.
- The root public-error lazy branch loads the same public entries in parallel with `BaseLayout`.
- Add route-local classes to the owning app entry. Never add downstream package paths here; extend that package's own entry instead.
