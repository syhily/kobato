# Web umbrella conventions

`packages/web/` is the UMBRELLA directory for the front-end packages, with no package of its own and no umbrella test
directory (the `ui-unit`, `ui-snaps`, and `web-unit` projects live in `tools/test/src/projects/`; cross-package contract
pins in the app test tree).

- `ui/` — `@kobato/ui`: the design system and the document shell — design tokens, base styles, the shadcn/Base UI
  primitives, theme and i18n providers, the document shell both app roots mount, the shared document modules (settings
  contexts, locale sync, chunk recovery, `BrandLogo`, `Image`, the document facts hooks), and generic presentation hooks
  (`ui/AGENTS.md`).
- `kit/` — `@kobato/web-kit`: the kit of ADR-0009/ADR-0011 — the features both consuming surfaces render that call a
  procedure (the notifications family, `use-logout`, `toast-api-error`). The comment surface and the shared composer
  platform are Inkling's public API, the root-data label hook is the workspace UI's, and the document-shell modules are
  `@kobato/ui`'s (ADR-0011). It stays a workspace package because the backend app never imports the public frontend. The
  admin UI is not a package: it lives in `apps/kobato/src/ui/` (ADR-0009), and the public surface lives in
  `apps/sayaka/src/ui/`.

The rule that separates the two packages: **`@kobato/ui` imports no `@kobato/api` module. A front-end module that calls
a procedure is a kit module or an app's own** (`packages/web/ui/tests/unit/contract/api-free.test.ts`).

## Module seam and direction

Both consuming surfaces may import `@kobato/web-kit`: `apps/kobato/src/ui` (the workspace admin tree) and
`apps/sayaka/src/ui` (the public tree):

- a kit module never imports `@kobato/server`, the sayaka app, or either consumer's tree (pinned by
  `apps/kobato/tests/arch/web-direction.test.ts`);
- sayaka never imports the kobato app or its `@/...` alias (pinned by `apps/sayaka/tests/arch/import-boundary.test.ts`);
- no module under `packages/web/*/src` reads React Router's `useRouteLoaderData`: root route data reaches a shared
  module only as document facts through `@kobato/ui/lib/document-facts-context`, provided by the document shell each app
  root mounts (pinned by `apps/kobato/tests/arch/web-direction.test.ts`).

## Backend access

- All RPC calls go through `orpc.<group>.<domain>.<endpoint>(flatInput)` from `@kobato/api/browser/client` (groups
  mirror `apiContract`); errors arrive as `ORPCError` rejections with `{ descriptor, issues }` in `data` — web packages
  never inspect `data` for copy and install no rejection interceptor. Wire error decoding lives in
  `@kobato/api/client/error`.
- Query keys and options come from `orpcQuery` in `@kobato/api/browser/orpc-query`; the app's `QueryClient` comes from
  `makeQueryClient` in `@kobato/api/browser/query-client`. The TanStack Query binding stays at that seam: a web package
  imports neither `@orpc/react-query` nor `@orpc/client` from production source.
- The singleton's assembly (CSRF token store, same-origin `/rpc` URL) is documented in `packages/api/AGENTS.md`. No
  route talks to domain services directly.

## Source layout and naming (the kit and both consuming UI trees)

- `src/` holds only the documented roots (`ui/` with its feature dirs, `styles/`); a new root directory needs a line
  here first.
- `PascalCase.tsx` components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `kebab-case.ts` for
  everything else; a module that renders JSX uses `.tsx`. No `index.ts`.
- A feature directory groups everything its surface needs; only three or more sibling files earn a nested directory.
- The kit's tests mirror the source tree one-for-one under `<pkg>/tests/unit/`; the consuming apps mirror their full
  `src/` under `apps/<app>/tests/{unit,snaps}/`.
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
