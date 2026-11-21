# Inkling demo

`apps/inkling-demo` is the standalone playground for `@kobato/inkling` (`pnpm demo`). It imports the editor through its public entries (`@kobato/inkling`, `@kobato/inkling/headless*`) and the design system through `@kobato/ui`; it is not part of the product build.

- `demo.tsx` / `DemoApp.tsx` — entry and shell; `components/` — demo cards and host integrations; `content/` — fixture documents; `hooks/` — demo-level React hooks; `utils/` — demo data/config helpers (no hooks).
- `styles/public.css` is the demo's single Tailwind compile; it composes the UI/Inkling partials exactly like the app's public surface (`packages/ui/src/styles/AGENTS.md`).
- Internal imports use `@kobato/inkling-demo/...`. Demo behavior, content generation, and host-contract type checks live under `tests/` in the root `demo-unit` project; they consume Inkling through its public entries and the sanctioned `tests/utils/` fixture seam. Run them with `pnpm test apps/inkling-demo`.
