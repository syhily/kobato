// PG → SQLite data pump — the one-shot upgrade path for deployments that
// ran the pre-SQLite (Postgres) kobato.
//
//   pnpm run db:pump -- postgres://user:pass@host:5432/kobato ./data/kobato.db
//
// What it does:
//   1. creates the output file through `openDatabase` — the pragma order
//      matters (`auto_vacuum` must be set before the schema exists), and
//      this is the same block every handle runs;
//   2. applies the bundled drizzle migrations, producing a fresh schema;
//   3. copies every table out of Postgres in dependency order, preserving
//      ids (PG bigint → JS number — the driver is configured to parse
//      int8 as numbers), converting per the new column modes
//      (timestamptz → epoch-ms Date, jsonb → plain JSON text, bytea →
//      Buffer, inet → text, enums → text) — all of which drizzle's
//      sqlite-core column modes handle on insert;
//   4. verifies referential integrity (`PRAGMA foreign_key_check`),
//      refreshes planner statistics (`ANALYZE`), and folds the WAL
//      (`closeDatabase` runs `wal_checkpoint(TRUNCATE)`) — the output is
//      a compact, statistics-fresh single file.
//
// Skipped tables (by design):
//   - session / kv_cache / one_time_token — ephemeral: users re-login,
//     caches rebuild, tokens expire. Skipping them also avoids
//     unwrapping legacy superjson envelopes.
//   - access_log — analytics moved to the DuckDB sidecar; skipped by
//     DEFAULT. Operators who want to keep telemetry history pass
//     `--include-analytics`, which pumps access_log into a DuckDB file
//     (`--analytics <path>`, default `<output dir>/analytics.duckdb`).
// Columns that no longer exist (post.embedding) are ignored: the pump
// maps only columns present in the new schema.
//
// Runs under vite-node (`pnpm run db:pump`) so the `@/` alias resolves —
// the drizzle schema and `openDatabase` are imported, never duplicated.

import { getColumns, getTableName } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pg from 'pg'

import type { EnrichedAccessEvent } from '@/server/domains/analytics/types'
import type { Database } from '@/server/infra/db/database'

import { ACCESS_LOG_DDL, appendAccessEvent } from '@/server/domains/analytics/services/access-log'
import { closeAnalyticsDatabase, openAnalyticsDatabase } from '@/server/infra/analytics/duckdb'
import { closeDatabase, openDatabase } from '@/server/infra/db/database'
import { backup } from '@/server/infra/db/schema/backup'
import { comment } from '@/server/infra/db/schema/comment'
import { auditLog, setting, slugRegistry } from '@/server/infra/db/schema/config'
import { content, postSearchIndex } from '@/server/infra/db/schema/content'
import { font } from '@/server/infra/db/schema/font'
import { friend } from '@/server/infra/db/schema/friend'
import { image, music } from '@/server/infra/db/schema/media'
import { like, metric } from '@/server/infra/db/schema/metric'
import { newsletterSubscriber } from '@/server/infra/db/schema/newsletter'
import { page } from '@/server/infra/db/schema/page'
import { passkeyCredential } from '@/server/infra/db/schema/passkey'
import { post } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category, tag } from '@/server/infra/db/schema/taxonomy'
import { user, verification } from '@/server/infra/db/schema/user'
import { webmention } from '@/server/infra/db/schema/webmention'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// PG int8 (OID 20) parses as string by default — ids and counts were
// bigint in Postgres and are plain numbers in the new schema.
pg.types.setTypeParser(20, (value: string | null) => (value === null ? null : Number(value)))

// Dependency order (parents before children). FK enforcement is also
// suspended for the load and verified afterwards, so a mistake here
// can't corrupt the output — only slow it down.
const TABLES = [
  user,
  setting,
  verification,
  passkeyCredential,
  category,
  tag,
  post,
  page,
  postTag,
  content,
  postSearchIndex,
  comment,
  metric,
  like,
  image,
  music,
  font,
  friend,
  newsletterSubscriber,
  webmention,
  backup,
  auditLog,
  slugRegistry,
]

type AnyTable = (typeof TABLES)[number]

/** Rows wider than this chunk stay well under SQLITE_MAX_VARIABLE_NUMBER. */
const INSERT_CHUNK = 200

interface PumpStats {
  table: string
  rows: number
  skipped: boolean
}

/**
 * Project one PG row (snake_case keys) onto the new schema's insert
 * shape (camelCase keys), keeping only columns the new schema still
 * has. Values pass through untouched: the pg driver's type parsers and
 * drizzle's sqlite-core column modes between them cover every
 * conversion (int8 → number via the parser above; Date / JSON / Buffer /
 * boolean via the column modes on insert).
 */
function mapRow(table: AnyTable, row: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [key, column] of Object.entries(getColumns(table))) {
    const value = row[column.name]
    if (value === undefined) {
      continue
    }
    values[key] = value
  }
  return values
}

async function pumpTable(client: pg.Client, db: Database, table: AnyTable): Promise<PumpStats> {
  const name = getTableName(table)
  let rows: Record<string, unknown>[]
  try {
    const result = await client.query(`SELECT * FROM "${name}"`)
    rows = unsafeCast<Record<string, unknown>[]>(result.rows)
  } catch (error) {
    // 42P01 undefined_table — the source deployment predates this table.
    // Skipping is safe: brand-new tables start empty on a fresh install
    // too. Everything else is a hard failure.
    if (unsafeCast<{ code?: string }>(error).code === '42P01') {
      console.warn(`  WARN  ${name}: not present in the source database — skipped`)
      return { table: name, rows: 0, skipped: true }
    }
    throw error
  }
  if (rows.length === 0) {
    return { table: name, rows: 0, skipped: false }
  }
  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => mapRow(table, row))
      tx.insert(table).values(unsafeCast<never>(chunk)).run()
    }
  })
  return { table: name, rows: rows.length, skipped: false }
}

/** Project a PG access_log row (snake_case) onto an EnrichedAccessEvent. */
function toAccessEvent(row: Record<string, unknown>): EnrichedAccessEvent {
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  return {
    ts: unsafeCast<Date>(row.ts),
    visitorHash: str(row.visitor_hash) ?? '',
    sessionId: str(row.session_id),
    ip: str(row.ip),
    path: str(row.path) ?? '/',
    entityType: row.entity_type === 'post' || row.entity_type === 'page' ? row.entity_type : null,
    entityId: num(row.entity_id),
    referer: str(row.referer),
    refererHost: str(row.referer_host),
    country: str(row.country),
    region: str(row.region),
    city: str(row.city),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    timezone: str(row.timezone),
    language: str(row.language),
    ua: str(row.ua),
    browser: str(row.browser),
    browserVersion: str(row.browser_version),
    os: str(row.os),
    osVersion: str(row.os_version),
    device: str(row.device),
    deviceType: str(row.device_type),
    isBot: row.is_bot === true,
  }
}

/**
 * Pump access_log into the DuckDB sidecar (--include-analytics). Rows
 * come back from pg with ts as Date and entity_id as number (the int8
 * parser above); the row write goes through the domain's shared
 * appender (`appendAccessEvent`) so the column order has one owner.
 */
async function pumpAnalytics(client: pg.Client, analyticsPath: string): Promise<number> {
  let rows: Record<string, unknown>[]
  try {
    const result = await client.query('SELECT * FROM "access_log" ORDER BY ts')
    rows = unsafeCast<Record<string, unknown>[]>(result.rows)
  } catch (error) {
    // 42P01 undefined_table — nothing to carry over.
    if (unsafeCast<{ code?: string }>(error).code === '42P01') {
      console.warn('  WARN  access_log: not present in the source database — skipped')
      return 0
    }
    throw error
  }
  if (rows.length === 0) {
    return 0
  }
  const handle = await openAnalyticsDatabase(analyticsPath, ACCESS_LOG_DDL)
  try {
    const appender = await handle.writer.createAppender('access_log')
    let count = 0
    for (const row of rows) {
      appendAccessEvent(appender, toAccessEvent(row))
      appender.endRow()
      count++
      if (count % 2048 === 0) {
        appender.flushSync()
      }
    }
    appender.closeSync()
    return count
  } finally {
    await closeAnalyticsDatabase(handle)
  }
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  const [pgUrl, outputPath] = args
  const force = process.argv.includes('--force')
  const includeAnalytics = process.argv.includes('--include-analytics')
  const analyticsFlagIndex = process.argv.indexOf('--analytics')
  const analyticsPath =
    analyticsFlagIndex !== -1
      ? process.argv[analyticsFlagIndex + 1]
      : join(dirname(outputPath ?? ''), 'analytics.duckdb')
  if (!pgUrl || !outputPath || (analyticsFlagIndex !== -1 && !analyticsPath)) {
    console.error(
      'Usage: pnpm run db:pump -- <postgres-url> <output-sqlite-path> [--force] [--include-analytics [--analytics <duckdb-path>]]',
    )
    process.exit(1)
  }
  if (existsSync(outputPath)) {
    if (!force) {
      console.error(`Refusing to overwrite ${outputPath} — pass --force to replace it.`)
      process.exit(1)
    }
    rmSync(outputPath)
  }
  if (includeAnalytics && existsSync(analyticsPath)) {
    if (!force) {
      console.error(`Refusing to overwrite ${analyticsPath} — pass --force to replace it.`)
      process.exit(1)
    }
    rmSync(analyticsPath)
  }

  console.log(`==> PG → SQLite pump`)
  console.log(`    source: ${pgUrl.replace(/\/\/[^@]*@/, '//***@')}`)
  console.log(`    output: ${outputPath}`)

  const handle = openDatabase(outputPath)
  console.log('    applying migrations to the fresh file…')
  migrate(handle.db, { migrationsFolder: './drizzle', migrationsTable: '__drizzle_migrations' })

  const client = new pg.Client({ connectionString: pgUrl })
  await client.connect()
  try {
    // Suspend FK enforcement for the load (the standard SQLite restore
    // pattern); integrity is verified explicitly below.
    handle.client.exec('PRAGMA foreign_keys = OFF')
    const stats: PumpStats[] = []
    for (const table of TABLES) {
      const stat = await pumpTable(client, handle.db, table)
      stats.push(stat)
      if (!stat.skipped) {
        console.log(`    ${stat.table}: ${stat.rows} rows`)
      }
    }

    const violations = unsafeCast<{ rowid?: unknown }[]>(
      unsafeCast<unknown[]>(handle.client.prepare('PRAGMA foreign_key_check').all()),
    )
    handle.client.exec('PRAGMA foreign_keys = ON')
    if (violations.length > 0) {
      throw new Error(`foreign_key_check reported ${violations.length} violations — the output is NOT trustworthy`)
    }

    if (includeAnalytics) {
      const events = await pumpAnalytics(client, analyticsPath)
      console.log(`    access_log: ${events} events → ${analyticsPath}`)
    }

    const copied = stats.filter((s) => !s.skipped).reduce((sum, s) => sum + s.rows, 0)
    const skipped = stats.filter((s) => s.skipped).map((s) => s.table)
    console.log(`==> copied ${copied} rows across ${stats.length - skipped.length} tables`)
    if (skipped.length > 0) {
      console.log(`    skipped (missing in source): ${skipped.join(', ')}`)
    }
    console.log(
      includeAnalytics
        ? '    ephemeral tables (session, kv_cache, one_time_token) intentionally not copied'
        : '    ephemeral tables (session, kv_cache, one_time_token) and access_log intentionally not copied',
    )
  } finally {
    await client.end()
  }

  // Refresh planner statistics, then close — closeDatabase folds the WAL
  // (wal_checkpoint(TRUNCATE)) so the output is one clean file.
  handle.client.exec('ANALYZE')
  closeDatabase(handle)
  console.log('==> done — output is a compact, statistics-fresh single file')
}

await main()
