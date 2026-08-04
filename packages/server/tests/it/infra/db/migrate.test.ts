import type { Database, DatabaseHandle } from '@kobato/server/infra/db/database'
import type { EmbeddedMigrationAssets } from '@kobato/server/infra/db/migrate'

import { createTestDatabaseFile } from '#/_helpers/integration-db'

import { closeDatabase, openDatabase } from '@kobato/server/infra/db/database'
import { runEmbeddedMigrations } from '@kobato/server/infra/db/migrate'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// Folder path vs embedded path equivalence. The SEA binary ships no
// `drizzle/` directory — migrations are embedded as blob assets and run
// through `runEmbeddedMigrations`, which replaces the battle-tested
// folder reader in production SEA deployments. Both paths are executed
// here against fresh databases and must land on identical outcomes.

const MIGRATIONS_FOLDER = './drizzle'
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

interface MigrationRow {
  hash: string
  created_at: number
  name: string | null
}

interface DbShape {
  tables: string[]
  migrations: MigrationRow[]
}

function readDbShape(db: Database): DbShape {
  const tables = db
    .all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .map((r) => r.name)
  const migrations = db.all<MigrationRow>(sql`
    SELECT hash, created_at, name FROM ${sql.raw(`"${MIGRATIONS_TABLE}"`)} ORDER BY id
  `)
  return { tables, migrations }
}

// Handles opened directly (not via the harness) close locally; the
// createTestDatabaseFile handle self-cleans through the harness registry.
const handles: DatabaseHandle[] = []
afterAll(() => {
  for (const handle of handles.splice(0)) {
    closeDatabase(handle)
  }
})

describe('folder vs embedded migrations (sqlite)', () => {
  it('both paths land on identical tables and migration records', () => {
    const folderHandle = openDatabase(':memory:')
    handles.push(folderHandle)
    migrate(folderHandle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })

    const embeddedHandle = openDatabase(':memory:')
    handles.push(embeddedHandle)
    runEmbeddedMigrations(embeddedHandle.db, createFsMigrationAssets())

    const folderShape = readDbShape(folderHandle.db)
    const embeddedShape = readDbShape(embeddedHandle.db)

    expect(embeddedShape.tables).toEqual(folderShape.tables)
    expect(embeddedShape.migrations.map((m) => m.hash)).toEqual(folderShape.migrations.map((m) => m.hash))
    expect(embeddedShape.migrations.length).toBeGreaterThan(0)
  })

  it('is idempotent — a second run applies nothing', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
    const before = readDbShape(handle.db)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
    expect(readDbShape(handle.db)).toEqual(before)
  })

  it('applies the pragma set the runtime relies on', () => {
    // journal_mode=wal only exists on a real file — use the file variant.
    const handle = createTestDatabaseFile()
    expect(handle.db.get(sql`PRAGMA auto_vacuum`)).toEqual({ auto_vacuum: 2 })
    expect(handle.db.get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: 'wal' })
    expect(handle.db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 })
  })
})
