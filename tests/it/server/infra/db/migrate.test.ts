import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { afterAll, describe, expect, it } from 'vitest'

import type { Database, DatabaseHandle } from '@/server/infra/db/database'

import { createTestDatabaseFile } from '#/_helpers/integration-db'
import { closeDatabase, openDatabase } from '@/server/infra/db/database'

// The SEA binary runs the same folder migrator against the mounted VFS copy
// of this exact `drizzle/` tree (embedded byte-identical) — the boot smoke
// covers the in-binary run; here the folder path itself is pinned.

const MIGRATIONS_FOLDER = './drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

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

// Directly-opened handles close locally; createTestDatabaseFile self-cleans via the harness registry.
const handles: DatabaseHandle[] = []
afterAll(() => {
  for (const handle of handles.splice(0)) {
    closeDatabase(handle)
  }
})

describe('folder migrations (sqlite)', () => {
  it('applies the full drizzle tree and records every migration', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })

    const shape = readDbShape(handle.db)
    expect(shape.tables.length).toBeGreaterThan(0)
    expect(shape.migrations.length).toBeGreaterThan(0)
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
