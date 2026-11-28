# Web umbrella conventions

`packages/web/` is the UMBRELLA directory for the two front-end packages shared by both apps, split by what they may
import (ADR-0011 §1), with no package of its own and no umbrella test directory (the `ui-unit`, `ui-snaps`, and
`web-unit` projects live in `tools/test/src/projects/`; cross-package contract pins in `apps/kobato/tests/arch`). The
workspace — the admin, editor, and auth SPA — is not here: it is the kobato app itself (`apps/kobato`, ADR-0012 §2).

- `ui/` — `@kobato/ui`: the design system and the document shell — design tokens, base styles, the shadcn/Base UI
  primitives, theme and i18n providers, the document shell both app roots mount, the shared document modules (settings
  contexts, locale sync, chunk recovery, `BrandLogo`, `Image`, the document facts hooks), and generic presentation hooks
  (`ui/AGENTS.md`).
- `kit/` — `@kobato/web-kit`: the kit of ADR-0009/ADR-0011 — the features both consuming surfaces render that call a
  procedure (the notifications family, `use-logout`, `toast-api-error`). The procedure-calling hooks with no UI
  dependency are the contract's own (`@kobato/api/browser/use-notifications`, ADR-0011 §3), the comment surface and the
  shared composer platform are Inkling's public API, the root-data label hook is the workspace's, and the document-shell
  modules are `@kobato/ui`'s (`kit/AGENTS.md`).

The rule that separates the design system from what may call a procedure: **`@kobato/ui` imports no `@kobato/api`
module. A front-end module that calls a procedure is a kit module or an app's own.** Nothing else separates the two
packages (`packages/web/ui/tests/unit/contract/api-free.test.ts`). The one refinement is ADR-0011 §3: a
procedure-calling hook that imports no UI package, no message copy, and no route data is the contract's own, under
`@kobato/api/browser`. The workspace (`apps/kobato`) sits on top of both (it imports `@kobato/ui`, `@kobato/web-kit`,
`@kobato/api`, `@kobato/inkling`, the shared leaves) and nothing below it imports it — not the kit, not the design
system, never sayaka (`apps/sayaka/tests/arch/import-boundary.test.ts` bans everything from the kobato app).

## Module seam and direction

Both consuming surfaces may import `@kobato/web-kit`: the workspace tree (`apps/kobato/src/ui`) and the public tree
(`apps/sayaka/src/ui`):

- a kit module never imports `@kobato/server`, the sayaka app, or the kobato app — neither its `@/...` alias nor
  anything under `apps/kobato` (pinned by `apps/kobato/tests/arch/web-direction.test.ts` and `package-dag.test.ts`);
- sayaka never imports the kobato app or its `@/...` / `@tests/...` aliases (pinned by
  `apps/sayaka/tests/arch/import-boundary.test.ts`);
- the workspace's client tree never imports `@kobato/server`, `@kobato/db`, or sayaka — its test tree and the backend
  entry (`src/server.ts`, `src/server/`) are the exceptions, and both packages are declared test dependencies only — and
  nothing under `packages/web` is imported by the layer below it (pinned by
  `apps/kobato/tests/arch/web-direction.test.ts` and `package-dag.test.ts`, whose kobato src targets exclude
  `@kobato/db`);
- no module under `packages/web/*/src` reads React Router's `useRouteLoaderData` outside the two app roots: root route
  data reaches a shared module only as document facts through `@kobato/ui/lib/document-facts-context`, provided by the
  document shell each app root mounts (pinned by `apps/kobato/tests/arch/web-direction.test.ts`; each app's own root
  `Layout` is the one reader).

## Backend access

- All RPC calls go through `orpc.<group>.<domain>.<endpoint>(flatInput)` from `@kobato/api/browser/client` (groups
  mirror `apiContract`); errors arrive as `ORPCError` rejections with `{ descriptor, issues }` in `data` — web packages
  never inspect `data` for copy and install no rejection interceptor. Wire error decoding lives in
  `@kobato/api/client/error`.
- Query keys and options come from `orpcQuery` in `@kobato/api/browser/orpc-query`; the app's `QueryClient` comes from
  `makeQueryClient` in `@kobato/api/browser/query-client`; the contract's data hooks — `use-notifications`, the
  notifications reads with the read-state cache patch — come from `@kobato/api/browser/use-notifications` (the kit's
  notifications family and both apps' chrome consume them from there). The TanStack Query binding stays at that seam: a
  web package imports neither `@orpc/react-query` nor `@orpc/client` from production source.
- The singleton's assembly (CSRF token store, same-origin `/rpc` URL) is documented in `packages/api/AGENTS.md`. No
  route talks to domain services directly. In development each app's Vite dev server proxies `/rpc`, `/health`, and
  `/ready` to the backend (`apps/kobato/AGENTS.md`, `apps/sayaka/AGENTS.md`); production is one origin behind
  `apps/kobato` or the forwarded families through sayaka.

## Source layout and naming (the two packages and both consuming UI trees)

- `src/` holds only the documented roots — `@kobato/ui`: `components/`, `icons/`, `lib/`, `styles/`; the kit: `ui/` with
  its feature dirs, `styles/`; the workspace (`apps/kobato`): the React Router entry set (`root.tsx`, `routes.ts`,
  `routes/`) plus `ui/`, `styles/`, `lib/`, `document/`, `seo/`; a new root directory needs a line here first. No web
  package warms routes: the idle script and its manifest are the public site's (`apps/sayaka`).
- `PascalCase.tsx` components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `kebab-case.ts` for
  everything else; a module that renders JSX uses `.tsx`. No `index.ts`.
- A feature directory groups everything its surface needs; only three or more sibling files earn a nested directory.
- Every package imports itself through its package specifier (`@kobato/ui/<path>`, `@kobato/web-kit/<path>`; helpers as
  `@kobato/<name>/tests/utils/<name>`), never a relative path; the workspace imports itself through the app aliases
  `@/<path>` and `@tests/<path>`.
- The kit's tests mirror the source tree one-for-one under `<pkg>/tests/unit/`; the workspace mirrors its `src/` under
  `apps/kobato/tests/{unit,snaps}/`, sayaka under `apps/sayaka/tests/{unit,snaps}/`.
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
