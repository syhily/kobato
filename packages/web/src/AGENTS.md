# Web package conventions

`packages/web/src/` (`@kobato/web`) is the browser-side package: everything that ships to the client bundle lives here.

## Why one package

`client/` (hooks, oRPC client, editor glue) and `ui/` (pure-props components) reference each other in both directions — hooks render components, components call hooks. Splitting them would create a circular package dependency, so they share one package with two subdirectories; `styles/` (Tailwind tokens, design-system CSS) rides along because both consume it. Within the package, imports are relative; the old client↔ui discipline is unchanged, just no longer package-enforced.

## Rules

- Everything here is browser-safe: no `node:*` value imports, no `@kobato/server` value imports. Server-only shapes (oRPC input/output types) come from `@kobato/shared` contracts (Zod `z.infer`), never from server source.
- The ONE sanctioned server edge is the type-only `RouterClient<ApiRouter>` in `client/api/client.ts` (`@kobato/server` is a devDependency for exactly this). Any second type channel must go through a `@kobato/shared` contract instead.
- Imports: `@kobato/shared/...` and `@kobato/inkling` (the React barrel) across packages; relative paths inside the package.
- Subdirectory conventions load additively: `client/AGENTS.md`, `ui/AGENTS.md` (+ `ui/admin/settings/AGENTS.md`), `styles/AGENTS.md`.
