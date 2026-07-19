import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { EmbeddedMigrationAssets } from '@/server/infra/db/migrate'

import { createEmptyDatabase, dropWorkerDatabase } from '#/_helpers/integration-db'
import { runEmbeddedMigrations } from '@/server/infra/db/migrate'

// Folder path vs embedded path equivalence. The SEA binary ships no
// `drizzle/` directory — migrations are embedded as blob assets and run
// through `runEmbeddedMigrations`, which replaces the battle-tested
// folder reader in production SEA deployments. Both paths are executed
// here against fresh databases on the shared test stack and must land on
// identical outcomes.

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

// Mirrors the embedded asset key shape (`drizzle/<folder>/migration.sql`).
const KEY_PREFIX = 'drizzle/'
const SQL_SUFFIX = '/migration.sql'

/** Feed the embedded migrator the exact bytes of the real `drizzle/` tree. */
function createFsMigrationAssets(): EmbeddedMigrationAssets {
  return {
    listKeys(prefix) {
      if (prefix !== KEY_PREFIX) {
        return []
      }
      return readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(MIGRATIONS_FOLDER, entry.name, 'migration.sql')))
        .map((entry) => `${KEY_PREFIX}${entry.name}${SQL_SUFFIX}`)
    },
    getAsset(key) {
      if (!key.startsWith(KEY_PREFIX)) {
        return null
      }
      const path = join(MIGRATIONS_FOLDER, key.slice(KEY_PREFIX.length))
      return existsSync(path) ? readFileSync(path) : null
    },
  }
}

async function closeDb(db: NodePgDatabase): Promise<void> {
  const client = (db as unknown as { $client: { end: () => Promise<void> } }).$client
  await client.end()
}

interface MigrationRow {
  hash: string
  created_at: string
  name: string
}

interface DbShape {
  tables: string[]
  extensions: string[]
  migrations: MigrationRow[]
}

async function readDbShape(db: NodePgDatabase): Promise<DbShape> {
  const tables = await db.execute(sql`
    SELECT table_schema || '.' || table_name AS name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY 1
  `)
  const extensions = await db.execute(sql`
    SELECT extname AS name FROM pg_extension ORDER BY 1
  `)
  // Deterministic columns only: `id` is a serial and `applied_at` a
  // wall-clock timestamp. (hash, created_at, name) identifies each
  // migration's content, folder timestamp, and execution order.
  const migrations = await db.execute(sql`
    SELECT hash, created_at, name
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at, id
  `)
  return {
    tables: (tables.rows as { name: string }[]).map((row) => row.name),
    extensions: (extensions.rows as { name: string }[]).map((row) => row.name),
    migrations: migrations.rows as unknown as MigrationRow[],
  }
}

describe('infra/db/migrate (embedded SEA path)', () => {
  const workerId = process.env.VITEST_WORKER_ID || '0'
  const stamp = Date.now()
  const folderDbName = `kobato_migeq_${workerId}_${stamp}_folder`
  const embeddedDbName = `kobato_migeq_${workerId}_${stamp}_embedded`

  let folderDb: NodePgDatabase | undefined
  let embeddedDb: NodePgDatabase | undefined
  let folderShape: DbShape
  let embeddedShape: DbShape

  beforeAll(async () => {
    const [folderUrl, embeddedUrl] = await Promise.all([
      createEmptyDatabase(folderDbName),
      createEmptyDatabase(embeddedDbName),
    ])
    folderDb = drizzle({ connection: { connectionString: folderUrl, max: 1 } })
    embeddedDb = drizzle({ connection: { connectionString: embeddedUrl, max: 1 } })

    // Folder path: exactly what `migrateDatabase` runs outside SEA.
    await migrate(folderDb, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: MIGRATIONS_SCHEMA,
      migrationsTable: MIGRATIONS_TABLE,
    })
    // Embedded path: the SEA branch, fed the same bytes from disk.
    await runEmbeddedMigrations(embeddedDb, createFsMigrationAssets())

    folderShape = await readDbShape(folderDb)
    embeddedShape = await readDbShape(embeddedDb)
  })

  afterAll(async () => {
    if (folderDb !== undefined) {
      await closeDb(folderDb)
    }
    if (embeddedDb !== undefined) {
      await closeDb(embeddedDb)
    }
    await dropWorkerDatabase(folderDbName)
    await dropWorkerDatabase(embeddedDbName)
  })

  it('produces the same tables and extensions as the folder path', () => {
    expect(embeddedShape.tables).toEqual(folderShape.tables)
    expect(embeddedShape.extensions).toEqual(folderShape.extensions)
  })

  it('records the same __drizzle_migrations ledger as the folder path', () => {
    expect(embeddedShape.migrations.length).toBeGreaterThan(0)
    expect(embeddedShape.migrations).toEqual(folderShape.migrations)
  })

  it('is a clean no-op when the embedded path runs a second time', async () => {
    expect(embeddedDb).toBeDefined()
    await runEmbeddedMigrations(embeddedDb as NodePgDatabase, createFsMigrationAssets())

    expect(await readDbShape(embeddedDb as NodePgDatabase)).toEqual(embeddedShape)
  })
})
