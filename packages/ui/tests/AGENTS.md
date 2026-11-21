# UI test conventions

- `tests/unit/` (`ui-unit`) covers primitives, generic hooks, providers, and style/token contracts (`tests/contract/` runs in the same project).
- `tests/snaps/` (`ui-snaps`) covers primitive SSR snapshots.
- Run with `pnpm test packages/ui`.
- Product-component tests stay in `@kobato/web-admin`; UI-local rendering helpers come from `@kobato/ui/tests/utils/`, generic infrastructure from `@kobato/test`.
