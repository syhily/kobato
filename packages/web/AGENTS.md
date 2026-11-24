# Web umbrella conventions

`packages/web/` is the UMBRELLA directory for three sibling workspace packages, with no package of its own and no
umbrella test directory (the `web-unit`, `web-tz-unit`, and `web-snaps` projects live in `tools/test/src/projects/`;
cross-leaf contract pins in the app test tree):

- `admin/` — `@kobato/web-admin`: admin components, domain controllers, the page editor composition, admin style
  adapters.
- `public/` — `@kobato/web-public`: public chrome, comments, widgets, music player, plus the cross-surface
  `ui/shared`/`ui/lib` tiers.
- `client/` — `@kobato/web-client`: the browser platform below both product leaves.

## Module seam and direction

`@kobato/web-admin` → `@kobato/web-public` → `@kobato/web-client` → `@kobato/ui`, strictly:

- admin may reuse only the AUDITED `@kobato/web-public` modules pinned by `ADMIN_PUBLIC_IMPORTS` in
  `apps/kobato/tests/arch/web-direction.test.ts` — a long-term seam;
- a web-public module never imports `@kobato/web-admin` — a module both sides need belongs in
  `@kobato/web-public/ui/shared` (or moves down a leaf);
- a web-client module never imports either product leaf.

## Source layout and naming (all three leaves)

- `src/` holds only the documented roots (`ui/`, `hooks/`, `lib/`, `api/`, `editor/`, `settings/`, `route-warmup/`,
  feature dirs, `styles/`); a new root directory needs a line here first.
- `PascalCase.tsx` components, `use-kebab-case.ts(x)` hooks, `kebab-case-context.tsx` contexts, `kebab-case.ts` for
  everything else; a module that renders JSX uses `.tsx`. No `index.ts`.
- A feature directory groups everything its surface needs; only three or more sibling files earn a nested directory.
- Tests mirror the source tree one-for-one under `<leaf>/tests/{unit,snaps}/`.
