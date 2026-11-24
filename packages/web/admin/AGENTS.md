# Web-admin conventions

`@kobato/web-admin` (`packages/web/admin/`) is the ADMIN frontend leaf: admin components, domain controllers, and the
page editor composition in `src/ui/` (plus the admin editor style adapters in `src/styles/`). Umbrella direction rules
apply (`packages/web/AGENTS.md`). The intra-package feature graph under `src/ui/` is pinned by `ALLOWED_FEATURE_IMPORTS`
in `apps/kobato/tests/arch/admin-feature-graph.test.ts`: `ui/shared` is the reuse hub (never a dependent of a feature),
every other cross-feature edge is an audited allowlist row.

## Rules

- Production sources are browser-safe: no `node:*` value imports and no `@kobato/server` imports (value or type; server
  is a tests-only fixture dependency). The oRPC client is typed by `ContractRouterClient<typeof apiContract>` from
  `@kobato/api` (reached through `@kobato/web-client/api/client`); wire DTO shapes come from `@kobato/api/contracts`.
- Imports use `@kobato/web-admin/...` inside this package and the sanctioned external specifiers
  (`@kobato/web-public/...`, `@kobato/web-client/...`, `@kobato/ui/...`, the shared leaves) — never
  `@kobato/catalog/seo` (route title/meta resolution lives in the app layer), never `@kobato/inkling` across packages.
- Subdirectory docs load additively: `src/ui/AGENTS.md` (+ `src/ui/settings/AGENTS.md`), `src/styles/AGENTS.md`,
  `tests/AGENTS.md`.
