# Web umbrella conventions

`packages/web/` is the UMBRELLA directory for the front-end packages, with no package of its own and no umbrella test
directory (the `ui-unit`, `ui-snaps`, `web-unit`, and `web-snaps` projects live in `tools/test/src/projects/`;
cross-package contract pins in the app test tree).

- `ui/` — `@kobato/ui`: the design system — design tokens, base styles, the shadcn/Base UI primitives, theme and i18n
  providers, and generic presentation hooks (`ui/AGENTS.md`).
- `kit/` — `@kobato/web-kit`: the cross-surface kit of ADR-0009 — the modules both consuming surfaces render (the
  `ui/shared` and `ui/lib` tiers, the comment composer and body projection, the chunk-recovery family, `BrandLogo`,
  `Image`). It stays a workspace package because the backend app never imports the public frontend. The admin UI is not
  a package: it lives in `apps/kobato/src/ui/` (ADR-0009), and the public surface lives in `apps/sayaka/src/ui/`.

A module both consuming surfaces need lives in `@kobato/web-kit`, a UI primitive in `@kobato/ui`, and the app's own
document runtime or admin tree in the consuming app's `src/`.

## Module seam and direction

Both consuming surfaces may import `@kobato/web-kit`: `apps/kobato/src/ui` (the workspace admin tree) and
`apps/sayaka/src/ui` (the public tree):

- a kit module never imports `@kobato/server`, the sayaka app, or either consumer's tree (pinned by
  `apps/kobato/tests/arch/web-direction.test.ts`);
- sayaka never imports the kobato app or its `@/...` alias (pinned by `apps/sayaka/tests/arch/import-boundary.test.ts`).

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
- The kit's tests mirror the source tree one-for-one under `<pkg>/tests/{unit,snaps}/`; the consuming apps mirror their
  full `src/` under `apps/<app>/tests/{unit,snaps}/`.
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
