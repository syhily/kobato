# Web-admin conventions

`@kobato/web-admin` (`packages/web/admin/`) is the ADMIN frontend leaf: Kobato-specific admin components, domain controllers, and the page editor composition in `src/ui/` (plus the admin editor style adapters in `src/styles/`). Its siblings under the `packages/web/` umbrella are `@kobato/web-public` (`packages/web/public/` — the public frontend plus the cross-surface `ui/shared`/`ui/lib` tiers) and `@kobato/web-client` (`packages/web/client/` — the browser platform below both). Each has its own AGENTS.md; the umbrella rules live in `packages/web/AGENTS.md`.

## Module seam and direction

The direction is strictly `@kobato/web-admin` → `@kobato/web-public` → `@kobato/web-client` → `@kobato/ui` (admin may also depend on `@kobato/web-client` directly — it composes the browser platform):

- admin may reuse AUDITED `@kobato/web-public` modules (the exact set is pinned by `ADMIN_PUBLIC_IMPORTS` in `apps/kobato/tests/arch/web-direction.test.ts`: the chrome clock, `CommentContentHtml`, `LazyCommentBodyEditor`, `comment-body-helpers`, the music player card, `widgets/Image` — plus the cross-surface `ui/shared`/`ui/lib` tiers every document renders). These are long-term seams, not a transitional state;
- a web-public module NEVER imports `@kobato/web-admin` — a module both sides need belongs in `@kobato/web-public/ui/shared` (or moves down a leaf), never into admin;
- a web-client module never imports either product leaf.

## Rules

- Production sources are browser-safe: no `node:*` value imports and no `@kobato/server` imports (value or type). The oRPC client is typed by `ContractRouterClient<typeof apiContract>` from `@kobato/api` (reached through `@kobato/web-client/api/client`); wire DTO shapes come from `@kobato/contracts` (Zod `z.infer`). Server remains a tests-only fixture dependency (the settings suites pin the server merge behavior).
- Imports use `@kobato/web-admin/...` inside this package and `@kobato/web-public/...`, `@kobato/web-client/...`, `@kobato/ui/...`, the shared leaves (`@kobato/{utils,i18n,cache,auth,catalog,distribution,telemetry,settings,assets,lexical,sanitize,contracts}` — never `@kobato/seo`), or `@kobato/inkling` across packages.
- Subdirectory conventions load additively: `src/ui/AGENTS.md` (+ `src/ui/settings/AGENTS.md`) and `src/styles/AGENTS.md`; test conventions in `tests/AGENTS.md`. Design tokens and generic style partials live in `packages/ui/src/styles/AGENTS.md`; app-owned compilation entries live in `apps/kobato/src/styles/AGENTS.md`.
