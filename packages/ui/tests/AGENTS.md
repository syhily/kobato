# UI test conventions

- `tests/unit/` (`ui-unit`) covers primitives, generic hooks, providers, and style/token contracts (`tests/contract/` runs in the same project).
- `tests/snaps/` (`ui-snaps`) covers primitive SSR snapshots.
- Run with `npx vitest run --project ui-unit` / `--project ui-snaps`.
- Product-component tests stay in `@kobato/web`; shared rendering helpers come from `@kobato/test`.
