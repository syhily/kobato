# Database module conventions

`@kobato/db` owns the content database's SQLite/Drizzle implementation: connection primitives, schema, row types, query operations, migrations, and SQLite error classification. It depends on `@kobato/shared`, never on `@kobato/server`, `@kobato/web`, or `@kobato/ui`.

- Callers import source modules directly as `@kobato/db/<path>.ts`; there is no barrel.
- `drizzle/` contains the package-owned SQL migrations and the latest drizzle-kit snapshot. It ships as package source through the `@kobato/db/drizzle/*` export; `src/migrate.ts` resolves this directory through the `@kobato/db/package.json` export outside SEA. See `drizzle/AGENTS.md`.
- `database.ts` owns `node:sqlite` + Drizzle's synchronous driver and the `:memory:` sentinel. Configuration-specific path selection stays in the server composition layer.
- `schema/` contains only persistence schema. Domain validation and wire DTOs stay in `@kobato/shared` or the owning server domain.
- `operations/` contains reusable Drizzle queries. Domain orchestration and transport errors stay in `@kobato/server`.
- Process lifecycle, logging, batchers, schedulers, and SEA migration-path adaptation remain in `@kobato/server/infra/db/`.
- Imports within this package use the package root (`@kobato/db/...`), not relative traversal.
