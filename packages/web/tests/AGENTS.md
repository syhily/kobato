# Web test conventions

- **`tests/{unit,snaps,contract}/`** (`web-unit`, `web-snaps`) — hooks/components, SSR snapshots, and CSS/token contract guards (the `contract/` tree runs inside `web-unit`), mirroring `src/`: `packages/web/src/ui/public/post/PostListViews.tsx` → `packages/web/tests/snaps/ui/public/post/post-list-views.test.tsx`.
- Run with `npx vitest run --project web-unit` / `--project web-snaps`.
- Shared utilities (render helpers, query mocks, dialog stubs) come from `@kobato/test` (see `packages/helpers/test/AGENTS.md`).
