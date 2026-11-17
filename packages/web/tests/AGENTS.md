# Web test conventions

- **`tests/{unit,snaps}/`** plus `tests/contract/` (`web-unit`, `web-snaps`) — product hooks/components, host-style contracts, and SSR snapshots, mirroring `src/`: `packages/web/src/ui/public/post/PostListViews.tsx` → `packages/web/tests/snaps/ui/public/post/post-list-views.test.tsx`. Design-system primitives and CSS/token contracts live in `packages/ui/tests/`.
- Run with `npx vitest run --project web-unit` / `--project web-snaps`.
- Shared utilities (render helpers, query mocks, dialog stubs) come from `@kobato/test` (see `packages/tools/test/AGENTS.md`).
