import type { Database, DatabaseHandle } from '@kobato/db/database'

import { closeDatabase, databaseOf, openDatabase, sqliteOf } from '@kobato/db/database'
import { defaultMigrationsFolder, MIGRATIONS_TABLE, migrateDatabase } from '@kobato/db/migrate'
import { createTestDatabaseFile } from '@kobato/db/tests/utils/integration-db'
import { sql } from 'drizzle-orm'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const MIGRATIONS_FOLDER = defaultMigrationsFolder()

interface MigrationRow {
  hash: string
  created_at: number
  name: string | null
}

interface DbShape {
  tables: string[]
  migrations: MigrationRow[]
}

function soleMigrationSql(): string {
  const folders = readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  expect(folders).toHaveLength(1)
  return readFileSync(join(MIGRATIONS_FOLDER, folders[0]!, 'migration.sql'), 'utf8')
}

function readDbShape(db: Database): DbShape {
  const tables = sqliteOf(db)
    .all<{ name: string }>(sql`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .map((r) => r.name)
  const migrations = sqliteOf(db).all<MigrationRow>(sql`
    SELECT hash, created_at, name FROM ${sql.raw(`"${MIGRATIONS_TABLE}"`)} ORDER BY id
  `)
  return { tables, migrations }
}

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
    migrateDatabase(databaseOf(handle))

    const shape = readDbShape(databaseOf(handle))
    expect(shape.tables.length).toBeGreaterThan(0)
    expect(shape.migrations.length).toBeGreaterThan(0)
    expect(shape.tables).not.toContain('kv_cache')
  })

  it('is idempotent — a second run applies nothing', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrateDatabase(databaseOf(handle))
    const before = readDbShape(databaseOf(handle))
    migrateDatabase(databaseOf(handle))
    expect(readDbShape(databaseOf(handle))).toEqual(before)
  })

  it('adds the nullable notification i18n descriptor columns', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrateDatabase(databaseOf(handle))

    const columns = Object.fromEntries(
      sqliteOf(databaseOf(handle))
        .all<{ name: string; notnull: number }>(sql`PRAGMA table_info(notification)`)
        .map((column) => [column.name, column.notnull]),
    )

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
    migrateDatabase(databaseOf(handle))

    for (const table of ['post', 'page']) {
      const column = sqliteOf(databaseOf(handle))
        .all<{ name: string; notnull: number; dflt_value: string | null }>(sql`PRAGMA table_info(${sql.raw(table)})`)
        .find((entry) => entry.name === 'content_language')
      expect(column).toMatchObject({ name: 'content_language', notnull: 0, dflt_value: null })
    }

    const migrationSql = soleMigrationSql()
    expect(migrationSql).toContain('`content_language` text')
    expect(migrationSql).not.toMatch(/ALTER TABLE|^\s*UPDATE/im)
  })

  it('guards every CREATE statement with IF NOT EXISTS (drizzle/AGENTS.md)', () => {
    const statements = soleMigrationSql()
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '')
    expect(statements.length).toBeGreaterThan(0)
    for (const statement of statements) {
      expect(statement).toMatch(/^CREATE (TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS /)
    }
  })

  it('no-ops on a database that already holds the final schema', () => {
    const handle = openDatabase(':memory:')
    handles.push(handle)
    migrateDatabase(databaseOf(handle))
    const before = readDbShape(databaseOf(handle))
    sqliteOf(databaseOf(handle)).run(sql`DELETE FROM ${sql.raw(`"${MIGRATIONS_TABLE}"`)}`)
    migrateDatabase(databaseOf(handle))
    const after = readDbShape(databaseOf(handle))
    expect(after.tables).toEqual(before.tables)
    expect(after.migrations.length).toBe(before.migrations.length)
  })

  it('keeps only the latest snapshot.json (drizzle/AGENTS.md)', () => {
    const snapshots = readdirSync(MIGRATIONS_FOLDER, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(MIGRATIONS_FOLDER, entry.name, 'snapshot.json'))
      .filter((path) => existsSync(path))
    expect(snapshots.length).toBeLessThanOrEqual(1)
  })

  it('applies the pragma set the runtime relies on', () => {
    const handle = createTestDatabaseFile()
    expect(sqliteOf(databaseOf(handle)).get(sql`PRAGMA auto_vacuum`)).toEqual({ auto_vacuum: 2 })
    expect(sqliteOf(databaseOf(handle)).get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: 'wal' })
    expect(sqliteOf(databaseOf(handle)).get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 })
  })
})
