# Web umbrella conventions

`packages/web/` is the UMBRELLA directory for the web family — three sibling workspace packages, no package of its own:

- `admin/` — `@kobato/web-admin`: the admin frontend (admin components, domain controllers, the page editor composition, the admin style adapters).
- `public/` — `@kobato/web-public`: the public frontend (public chrome, comments, widgets, music player) plus the cross-surface `ui/shared`/`ui/lib` tiers.
- `client/` — `@kobato/web-client`: the browser platform below both product leaves (document-level hooks, the oRPC client, the root settings contexts, the cross-surface editor platform).
- `tests/` — the umbrella Vitest roots (`web (unit)` / `web-snaps`) and the CROSS-LEAF contract pins that must not live in any single leaf (see `tests/AGENTS.md`).

## Module seam and direction

The direction is strictly `@kobato/web-admin` → `@kobato/web-public` → `@kobato/web-client` → `@kobato/ui`:

- admin may reuse AUDITED `@kobato/web-public` modules (the exact set is pinned by `ADMIN_PUBLIC_IMPORTS` in `apps/kobato/tests/arch/web-direction.test.ts`) — a long-term seam, not a transitional state;
- a web-public module never imports `@kobato/web-admin` — a module both sides need belongs in `@kobato/web-public/ui/shared` (or moves down a leaf);
- a web-client module never imports either product leaf.

## Source layout and naming (all three leaves)

- `src/` holds exactly one of the documented roots (`ui/`, `hooks/`, `lib/`, `api/`, `editor/`, `settings/`, `route-warmup/`, `chat/`-style feature dirs, `styles/`); a new root directory needs a line here first.
- Component files are `PascalCase.tsx`; hooks are `use-kebab-case.ts(x)`; contexts are `kebab-case-context.tsx`; every other module is `kebab-case.ts`; a module that renders JSX uses `.tsx`. No `index.ts`.
- A feature directory groups everything its surface needs (view, subcomponents, controllers/hooks, pure helpers); only a family of three or more sibling files earns a nested directory.
- Tests mirror the source tree one-for-one under `<leaf>/tests/{unit,snaps}/` — the test file for `ui/posts/page-meta.ts` is `tests/unit/ui/posts/page-meta.test.ts`.

Each leaf carries its own AGENTS.md (`admin/AGENTS.md`, `public/AGENTS.md`, `client/AGENTS.md`) plus nested module docs; load them additively as you enter a tree.
