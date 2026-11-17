# Web package conventions

`packages/web/src/` (`@kobato/web`) is the product-frontend package: browser behavior, data access, editor glue, and Kobato-specific public/admin components.

## Module seam

`client/` is the LOWER layer: the browser platform — oRPC client, document-level hooks (RUM/consent, device beacon, chunk recovery, iOS zoom lock), the root settings provider, and the cross-surface editor platform shared by the page and comment composers. `ui/` is the product layer: product components, domain controllers, and the page/comment editor composition that wires that platform into concrete editors. The direction is strictly `ui/` → `client/`: a `client/` module NEVER imports `@kobato/web/ui/...`, and `apps/kobato/tests/arch/web-direction.test.ts` enforces this over the real import graph with NO exceptions — a client module that needs a ui module moves to ui. The reusable design system is separate: `@kobato/ui` owns base styles, primitives, icons, theme/i18n providers, and generic presentation hooks. Web may depend on UI; UI never depends on web.

## Rules

- Everything here is browser-safe: no `node:*` value imports, no `@kobato/server` value imports. Server-only shapes (oRPC input/output types) come from `@kobato/contracts` (Zod `z.infer`), never from server source.
- The ONE sanctioned server edge is the type-only `RouterClient<ApiRouter>` in `client/api/client.ts` (`@kobato/server` is a devDependency for exactly this). Any second type channel must go through a `@kobato/contracts` schema instead.
- Imports use `@kobato/web/...` inside this package and `@kobato/ui/...`, the shared leaves (`@kobato/{utils,i18n,cache,settings,assets,lexical,sanitize,contracts}` — never `@kobato/seo`), or `@kobato/inkling` across packages.
- Subdirectory conventions load additively: `src/client/AGENTS.md`, `src/ui/AGENTS.md` (+ `src/ui/admin/settings/AGENTS.md`), and `src/styles/AGENTS.md`. Design tokens and generic style partials live in `packages/ui/src/styles/AGENTS.md`; app-owned compilation entries live in `apps/kobato/src/styles/AGENTS.md`.
