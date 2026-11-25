# Web umbrella conventions

`packages/web/` is the UMBRELLA directory for the two product-leaf workspace packages, with no package of its own and no
umbrella test directory (the `web-unit`, `web-tz-unit`, and `web-snaps` projects live in `tools/test/src/projects/`;
cross-leaf contract pins in the app test tree):

- `admin/` — `@kobato/web-admin`: admin components, domain controllers, the page editor composition, admin style
  adapters.
- `public/` — `@kobato/web-public`: public chrome, comments, widgets, music player, plus the cross-surface
  `ui/shared`/`ui/lib` tiers.

There is no shared web package below the leaves (`apps/kobato/tests/arch/web-direction.test.ts` pins `packages/web` to
exactly these two directories): a module both leaves need lives in `@kobato/web-public/ui/shared` or `ui/lib`, a UI
primitive in `@kobato/ui`, and the app's own document runtime in `apps/kobato/src` (`apps/kobato/AGENTS.md`).

## Module seam and direction

`@kobato/web-admin` → `@kobato/web-public` → `@kobato/ui`, strictly:

- admin may reuse only the AUDITED `@kobato/web-public` modules pinned by `ADMIN_PUBLIC_IMPORTS` in
  `apps/kobato/tests/arch/web-direction.test.ts` — a long-term seam; the `ui/shared/` and `ui/lib/` tiers are exempt
  from that audit because they exist for both leaves;
- a web-public module never imports `@kobato/web-admin`.

## Backend access

- All RPC calls go through `orpc.<group>.<domain>.<endpoint>(flatInput)` from `@kobato/api/browser/client` (groups
  mirror `apiContract`); errors arrive as `ORPCError` rejections with `{ descriptor, issues }` in `data` — leaves never
  inspect `data` for copy and install no rejection interceptor. Wire error decoding lives in `@kobato/api/client/error`.
- Query keys and options come from `orpcQuery` in `@kobato/api/browser/orpc-query`; the app's `QueryClient` comes from
  `makeQueryClient` in `@kobato/api/browser/query-client`. The TanStack Query binding stays at that seam: a web leaf
  imports neither `@orpc/react-query` nor `@orpc/client`.
- The singleton's assembly (CSRF token store, same-origin `/rpc` URL) is documented in `packages/api/AGENTS.md`. No
  route talks to domain services directly.

## Source layout and naming (both leaves)

- `src/` holds only the documented roots (`ui/` with its feature dirs, `styles/`); a new root directory needs a line
  here first.
- `PascalCase.tsx` components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `kebab-case.ts` for
  everything else; a module that renders JSX uses `.tsx`. No `index.ts`.
- A feature directory groups everything its surface needs; only three or more sibling files earn a nested directory.
- Tests mirror the source tree one-for-one under `<leaf>/tests/{unit,snaps}/`.
- Heavy widgets reach the bundle via React.lazy + Suspense, not top-level imports.
