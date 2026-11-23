import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'

import { DuckDBInstance } from '@duckdb/node-api'
import { engineOf } from '@kobato/db/duckdb/connection'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@kobato/db/duckdb/database'
import { defaultAnalyticsMigrationsFolder } from '@kobato/db/duckdb/migrate'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const BASELINE_NAME = '20261123020640_initial_analytics_schema'
const BASELINE_SQL = readFileSync(join(defaultAnalyticsMigrationsFolder(), BASELINE_NAME, 'migration.sql'), 'utf8')

const dirs: string[] = []
const handles: AnalyticsHandle[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-duckdb-migrations-'))
  dirs.push(dir)
  return dir
}

async function open(path: string, migrationsFolder?: string): Promise<AnalyticsHandle> {
  const handle = await openAnalyticsDatabase(path, { migrationsFolder })
  handles.push(handle)
  return handle
}

async function journalRows(handle: AnalyticsHandle) {
  const result = await engineOf(handle).reader.runAndReadAll(
    'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
  )
  return result.getRowObjects()
}

afterEach(async () => {
  for (const handle of handles.splice(0)) {
    if (!handle.closed) {
      await closeAnalyticsDatabase(handle)
    }
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('DuckDB schema migrations', () => {
  it('creates the current schema and journal in memory', async () => {
    const handle = await open(':memory:')
    const tables = await engineOf(handle).reader.runAndReadAll(
      `SELECT table_name FROM duckdb_tables() WHERE table_name IN ('access_events', 'device_env_server', 'device_env_client')`,
    )
    expect(
      tables
        .getRowObjects()
        .map((row) => String(row.table_name))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['access_events', 'device_env_client', 'device_env_server'])
    expect(await journalRows(handle)).toHaveLength(1)
  })

  it('adopts an existing unjournaled schema without losing data', async () => {
    const path = join(makeDir(), 'analytics.duckdb')
    const instance = await DuckDBInstance.create(path)
    const connection = await instance.connect()
    for (const statement of BASELINE_SQL.split('--> statement-breakpoint')) {
      await connection.run(statement)
    }
    await connection.run(
      `INSERT INTO access_events (event_id, timestamp, is_bot, blob1) VALUES (uuid(), to_timestamp(1768000000), false, '/adopted')`,
    )
    connection.closeSync()
    instance.closeSync()

    const handle = await open(path)
    const rows = await engineOf(handle).reader.runAndReadAll('SELECT blob1 AS path FROM access_events')
    expect(rows.getRowObjects()).toEqual([{ path: '/adopted' }])
    expect(await journalRows(handle)).toHaveLength(1)

    await closeAnalyticsDatabase(handle)
    const reopened = await open(path)
    expect(await journalRows(reopened)).toHaveLength(1)
  })

  it('applies later migrations once in folder order', async () => {
    const dir = makeDir()
    const migrations = join(dir, 'migrations')
    const baseline = join(migrations, '20260101000000_initial')
    mkdirSync(baseline, { recursive: true })
    writeFileSync(join(baseline, 'migration.sql'), BASELINE_SQL)
    const later = join(migrations, '20260102000000_add_migration_probe')
    mkdirSync(later)
    writeFileSync(join(later, 'migration.sql'), 'CREATE TABLE migration_probe (id INTEGER)')

    const handle = await open(join(dir, 'analytics.duckdb'), migrations)
    expect(await journalRows(handle)).toHaveLength(2)
    await engineOf(handle).writer.run('INSERT INTO migration_probe VALUES (1)')
    await closeAnalyticsDatabase(handle)

    const reopened = await open(join(dir, 'analytics.duckdb'), migrations)
    const rows = await engineOf(reopened).reader.runAndReadAll('SELECT id FROM migration_probe')
    expect(rows.getRowObjects()).toEqual([{ id: 1 }])
    expect(await journalRows(reopened)).toHaveLength(2)
  })

  it('closes native resources when a migration fails', async () => {
    const dir = makeDir()
    const migrations = join(dir, 'broken')
    mkdirSync(join(migrations, '20260101000000_broken'), { recursive: true })
    writeFileSync(join(migrations, '20260101000000_broken', 'migration.sql'), 'CREATE TABLE broken (')
    const path = join(dir, 'analytics.duckdb')

    await expect(openAnalyticsDatabase(path, { migrationsFolder: migrations })).rejects.toThrow()

    const handle = await open(path)
    expect(await journalRows(handle)).toHaveLength(1)
  })
})
