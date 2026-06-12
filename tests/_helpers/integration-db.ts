import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

/**
 * Admin pool connected to the default `postgres` database.
 * Used only for CREATE/DATABASE operations.
 */
function getAdminPool(): Pool {
  const baseUrl = new URL(process.env.DATABASE_URL!)
  baseUrl.pathname = '/postgres'
  return new Pool({ connectionString: baseUrl.toString() })
}

/**
 * Detect which optional extensions are available in the current Postgres
 * instance. Returns a Set of available extension names.
 *
 * If the query fails (e.g. the database is not fully ready yet), we catch
 * the error and return an empty set so the caller can fall back to skipping
 * extension-dependent migrations.
 */
async function detectAvailableExtensions(db: ReturnType<typeof drizzle>): Promise<Set<string>> {
  try {
    const result = await db.execute(sql`
      SELECT name FROM pg_available_extensions
      WHERE name IN ('timescaledb', 'vector')
    `)
    return new Set((result.rows as { name: string }[]).map((r) => r.name))
  } catch {
    return new Set()
  }
}

/**
 * Run migrations. If the test Postgres instance has both timescaledb and
 * pgvector available, all migrations are applied normally.  Otherwise,
 * migrations that reference missing extensions are skipped so the test suite
 * can still run against a plain Postgres container.
 */
async function runTestMigrations(db: ReturnType<typeof drizzle>): Promise<void> {
  const available = await detectAvailableExtensions(db)
  const allExtensionsAvailable = available.has('timescaledb') && available.has('vector')

  if (allExtensionsAvailable) {
    await migrate(db, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    })
    return
  }

  // Some extensions are missing — copy migrations to a temp directory and
  // omit the ones that require unavailable extensions.
  const tempDir = await mkdtemp(join(tmpdir(), 'drizzle-test-'))

  try {
    const entries = await readdir(MIGRATIONS_FOLDER, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue
      }
      const src = join(MIGRATIONS_FOLDER, entry.name)
      const sqlPath = join(src, 'migration.sql')
      const content = await readFile(sqlPath, 'utf-8')

      const needsTimescaledb = content.includes('CREATE EXTENSION IF NOT EXISTS timescaledb')
      const needsVector = content.includes('CREATE EXTENSION IF NOT EXISTS vector')

      if (needsTimescaledb && !available.has('timescaledb')) {
        continue
      }
      if (needsVector && !available.has('vector')) {
        continue
      }

      const dest = join(tempDir, entry.name)
      await cp(src, dest, { recursive: true })
    }

    await migrate(db, {
      migrationsFolder: tempDir,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    })
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

/**
 * Create a fresh test database for the given Vitest worker, run migrations,
 * and return the connection URL.
 */
export async function createWorkerDatabase(workerId: string): Promise<string> {
  const dbName = `kobato_test_${workerId}_${Date.now()}`
  const adminPool = getAdminPool()

  try {
    await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
    await adminPool.query(`CREATE DATABASE "${dbName}"`)
  } finally {
    await adminPool.end()
  }

  const testUrl = new URL(process.env.DATABASE_URL!)
  testUrl.pathname = `/${dbName}`
  const connectionString = testUrl.toString()

  // Pre-create optional extensions in the new database using the admin
  // connection.  The drizzle `enable_pgvector` migration may fail silently
  // or run too late in some environments (e.g. CI service containers),
  // so we ensure the extensions exist before migrations start.
  const extPool = new Pool({ connectionString })
  try {
    await extPool.query(`CREATE EXTENSION IF NOT EXISTS vector`)
  } catch {
    // ignore — extension not available in this Postgres build
  }
  try {
    await extPool.query(`CREATE EXTENSION IF NOT EXISTS timescaledb`)
  } catch {
    // ignore — extension not available in this Postgres build
  }
  await extPool.end()

  // Run migrations in the newly-created database.
  // Use `connection: { connectionString, max: 1 }` to match the project's
  // `migrate.ts` pattern and avoid pooling issues during setup.
  const db = drizzle({
    connection: { connectionString, max: 1 },
  })

  // Ensure the connection is actually ready before running migrations.
  // The pg Pool is lazy; the first query may fail if the DB isn't fully
  // initialised yet (especially in CI service containers).
  await db.execute(sql`select 1`)

  await runTestMigrations(db)
  const client = db.$client as { end: () => Promise<void> }
  await client.end()

  return connectionString
}

/**
 * Drop a test database created by {@link createWorkerDatabase}.
 */
export async function dropWorkerDatabase(dbNameOrUrl: string): Promise<void> {
  // Accept either a full URL or just the database name
  const dbName = dbNameOrUrl.includes('/') ? new URL(dbNameOrUrl).pathname.slice(1) : dbNameOrUrl

  const adminPool = getAdminPool()
  try {
    await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
  } finally {
    await adminPool.end()
  }
}

/**
 * TRUNCATE all user tables in the given database. Useful when a test file
 * wants to reset state between its own test cases without tearing down the
 * whole database.
 */
export async function clearAllTables(db: NodePgDatabase): Promise<void> {
  // Query information_schema for all tables in the public schema,
  // excluding drizzle's own migration table.
  const result = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name != ${MIGRATIONS_TABLE}
    ORDER BY table_name
  `)

  const rows = result.rows as { table_name: string }[]
  const tables = rows.map((r) => `"${r.table_name}"`).join(', ')
  if (tables.length > 0) {
    await db.execute(sql.raw(`TRUNCATE TABLE ${tables} CASCADE`))
  }
}
