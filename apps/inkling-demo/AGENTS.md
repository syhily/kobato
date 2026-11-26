# Inkling demo

`apps/inkling-demo` is the standalone playground for `@kobato/inkling` (`pnpm demo`). It imports the editor through its
public entries (`@kobato/inkling`, `@kobato/inkling/headless*`) and the design system through `@kobato/ui`; it is not
part of the product build.

- Standard Vite app layout: `index.html` / `public/` at the package root, source under `src/` — `src/demo.tsx` (Vite
  entry, HashRouter routes) and `src/DemoApp.tsx` shell; `src/components/` demo cards and host integrations;
  `src/content/` fixture documents; `src/hooks/` demo-level React hooks; `src/utils/` demo data/config helpers (no
  hooks).
- `src/styles/public.css` is the demo's single Tailwind compile; it composes the UI/Inkling/kit partials exactly like
  the app's public surface (`packages/ui/src/styles/AGENTS.md`).
- Internal imports use `@kobato/inkling-demo/...` (resolved through the package `exports` map to `src/`).
  `src/generate-content.ts` regenerates `src/content/content.json` — run `pnpm run demo:content` (the write path is
  anchored on the demo directory, never cwd).
- Tests under `tests/` are real behavior tests only, in the root `demo-unit` project; they consume Inkling through its
  public entries and the sanctioned `tests/utils/` fixture seam (`pnpm test apps/inkling-demo`).
