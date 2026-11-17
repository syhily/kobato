# Shared test conventions

- **`tests/{unit,snaps}/`** (`shared-unit`, `shared-snaps`) — isomorphic logic and SSR snapshots for `@kobato/shared`, mirroring `src/`.
- Run with `npx vitest run --project shared-unit` / `--project shared-snaps`.
- Shared utilities come from `@kobato/test` (see `packages/tools/test/AGENTS.md`).
