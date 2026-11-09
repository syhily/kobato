import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { readFileSync } from 'node:fs'
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
    // The legacy SQLite cache table is gone — storage lives on the filesystem.
    expect(shape.tables).not.toContain('kv_cache')
  })

  it('is idempotent — a second run applies nothing', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
    const before = readDbShape(handle.db)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })
    expect(readDbShape(handle.db)).toEqual(before)
  })

  it('adds the nullable notification i18n descriptor columns', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })

    const columns = Object.fromEntries(
      handle.db
        .all<{ name: string; notnull: number }>(sql`PRAGMA table_info(notification)`)
        .map((column) => [column.name, column.notnull]),
    )

    // Plan 001, 5b-ii: the English fallback stays in title/body; the descriptor
    // columns are nullable so legacy direct/broadcast rows need no backfill.
    expect(columns).toMatchObject({
      title: 1,
      body: 1,
      title_key: 0,
      title_params: 0,
      body_key: 0,
      body_params: 0,
    })
  })

  it('adds the nullable content-language columns with no backfill', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsTable: MIGRATIONS_TABLE })

    for (const table of ['post', 'page']) {
      const column = handle.db
        .all<{ name: string; notnull: number; dflt_value: string | null }>(sql`PRAGMA table_info(${sql.raw(table)})`)
        .find((entry) => entry.name === 'content_language')
      // Nullable with no default: a pre-migration row keeps meaning "unset"
      // (inherit the document language) without any data rewrite.
      expect(column).toMatchObject({ name: 'content_language', notnull: 0, dflt_value: null })
    }

    // The migration is additive only: two ALTERs, no UPDATE / DEFAULT rewrite.
    const migrationSql = readFileSync('drizzle/20261108113858_content_language/migration.sql', 'utf8')
    expect(migrationSql).toContain('ALTER TABLE `page` ADD `content_language` text')
    expect(migrationSql).toContain('ALTER TABLE `post` ADD `content_language` text')
    expect(migrationSql).not.toMatch(/UPDATE|DEFAULT/i)
  })

  it('applies the pragma set the runtime relies on', () => {
    // journal_mode=wal only exists on a real file — use the file variant.
    const handle = createTestDatabaseFile()
    expect(handle.db.get(sql`PRAGMA auto_vacuum`)).toEqual({ auto_vacuum: 2 })
    expect(handle.db.get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: 'wal' })
    expect(handle.db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 })
  })
})
