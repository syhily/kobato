# Web-admin conventions

`@kobato/web-admin` (`packages/web/admin/`) is the ADMIN frontend leaf: admin components, domain controllers, and the
page editor composition in `src/ui/` (plus the admin editor style adapters in `src/styles/`).

## Module seam and direction

The direction is strictly `@kobato/web-admin` → `@kobato/web-public` → `@kobato/web-client` → `@kobato/ui`:

- admin may reuse AUDITED `@kobato/web-public` modules — the exact set pinned by `ADMIN_PUBLIC_IMPORTS` in
  `apps/kobato/tests/arch/web-direction.test.ts` (plus the cross-surface `ui/shared`/`ui/lib` tiers) — a long-term seam,
  not a transitional state.
- a web-public module NEVER imports `@kobato/web-admin` — a module both sides need belongs in
  `@kobato/web-public/ui/shared`, never into admin.
- a web-client module never imports either product leaf.
- the intra-package feature graph under `src/ui/` is pinned by `ALLOWED_FEATURE_IMPORTS` in
  `apps/kobato/tests/arch/admin-feature-graph.test.ts`: `ui/shared` is the reuse hub (never a dependent of a feature),
  every other cross-feature edge is an audited allowlist row.

## Rules

- Production sources are browser-safe: no `node:*` value imports and no `@kobato/server` imports (value or type). The
  oRPC client is typed by `ContractRouterClient<typeof apiContract>` from `@kobato/api` (reached through
  `@kobato/web-client/api/client`); wire DTO shapes come from `@kobato/contracts`. Server stays a tests-only fixture
  dependency.
- Imports use `@kobato/web-admin/...` inside this package and the sanctioned external specifiers
  (`@kobato/web-public/...`, `@kobato/web-client/...`, `@kobato/ui/...`, the shared leaves — never `@kobato/seo`,
  `@kobato/inkling` across packages).
- Subdirectory conventions load additively: `src/ui/AGENTS.md` (+ `src/ui/settings/AGENTS.md`) and
  `src/styles/AGENTS.md`; test conventions in `tests/AGENTS.md`.
