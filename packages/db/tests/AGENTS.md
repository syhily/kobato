# Database test conventions

- `tests/unit/` (`db-unit`) covers pure schema, query-builder, and SQLite error behavior without a real database.
- `tests/it/` (`db-it`) covers real Drizzle/SQLite operations through `@kobato/db` interfaces.
- Run with `npx vitest run --project db-unit` / `--project db-it`.
- Shared setup and database helpers come from `@kobato/test`; server lifecycle, batcher, and migration-adapter tests stay in `@kobato/server`.
