import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables } from '#/_helpers/integration-db'
import { queryCounters } from '@/server/domains/analytics/services/counters'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { accessLog } from '@/server/infra/db/schema/config'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

const DAY = 24 * 60 * 60

function dateAt(iso: string): Date {
  return new Date(iso)
}

function unixAt(iso: string): number {
  return Math.floor(dateAt(iso).getTime() / 1000)
}

async function refreshContinuousAggregates(): Promise<void> {
  await db.execute(sql`CALL refresh_continuous_aggregate('stats_hourly', NULL, NULL)`)
  await db.execute(sql`CALL refresh_continuous_aggregate('stats_daily', NULL, NULL)`)
}

async function hasTimescaleDb(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'
  `)
  return result.rows.length > 0
}

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
})

describe('analytics counters from raw access_log', () => {
  it('counts rows for ranges ≤ 24 hours', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/post/1' },
      // Outside the 24-hour window.
      { ts: dateAt('2026-01-14T11:59:59.000Z'), visitorHash: 'c', path: '/' },
    ])

    const result = await queryCounters(db, { range: { startAt, endAt: now }, filters: {} })

    expect(result).toEqual({ visits: 2, visitors: 2, referers: 0 })
  })

  it('counts distinct referer hosts', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-15T09:00:00.000Z'), visitorHash: 'c', path: '/', refererHost: 'x.com' },
      { ts: dateAt('2026-01-15T08:00:00.000Z'), visitorHash: 'd', path: '/', refererHost: null },
      { ts: dateAt('2026-01-15T07:00:00.000Z'), visitorHash: 'e', path: '/', refererHost: '' },
    ])

    const result = await queryCounters(db, { range: { startAt, endAt: now }, filters: {} })

    expect(result).toEqual({ visits: 5, visitors: 5, referers: 2 })
  })
})

const timescaleDbAvailable = await hasTimescaleDb()

describe.skipIf(!timescaleDbAvailable)('analytics counters from continuous aggregates', () => {
  it('sums hourly aggregates for 1–30 day ranges', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - 7 * DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'a', path: '/post/1' },
      { ts: dateAt('2026-01-14T12:00:00.000Z'), visitorHash: 'b', path: '/' },
      { ts: dateAt('2026-01-08T12:00:00.000Z'), visitorHash: 'c', path: '/' },
      // Outside the 7-day window.
      { ts: dateAt('2026-01-08T11:59:59.000Z'), visitorHash: 'd', path: '/' },
    ])
    await refreshContinuousAggregates()

    const result = await queryCounters(db, { range: { startAt, endAt: now }, filters: {} })

    expect(result).toEqual({ visits: 4, visitors: 3, referers: 0 })
  })

  it('sums daily aggregates for ranges > 30 days', async () => {
    const endAt = unixAt('2026-01-15T00:00:00.000Z')
    const startAt = endAt - 60 * DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-14T12:00:00.000Z'), visitorHash: 'a', path: '/' },
      { ts: dateAt('2026-01-14T13:00:00.000Z'), visitorHash: 'a', path: '/post/1' },
      { ts: dateAt('2026-01-01T00:00:00.000Z'), visitorHash: 'b', path: '/' },
      { ts: dateAt('2025-11-16T00:00:00.000Z'), visitorHash: 'c', path: '/' },
      // Outside the 60-day window.
      { ts: dateAt('2025-11-15T23:59:59.000Z'), visitorHash: 'd', path: '/' },
    ])
    await refreshContinuousAggregates()

    const result = await queryCounters(db, { range: { startAt, endAt }, filters: {} })

    expect(result).toEqual({ visits: 4, visitors: 3, referers: 0 })
  })

  it('falls back to raw access_log when a filter dimension is not in the aggregate', async () => {
    const endAt = unixAt('2026-01-15T00:00:00.000Z')
    const startAt = endAt - 60 * DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-14T12:00:00.000Z'), visitorHash: 'a', path: '/', browser: 'Chrome' },
      { ts: dateAt('2026-01-13T12:00:00.000Z'), visitorHash: 'b', path: '/', browser: 'Firefox' },
    ])
    await refreshContinuousAggregates()

    const result = await queryCounters(db, {
      range: { startAt, endAt },
      filters: { browser: 'Chrome' },
    })

    expect(result).toEqual({ visits: 1, visitors: 1, referers: 0 })
  })

  it('counts distinct referer hosts from raw access_log regardless of aggregate source', async () => {
    const endAt = unixAt('2026-01-15T00:00:00.000Z')
    const startAt = endAt - 60 * DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-14T12:00:00.000Z'), visitorHash: 'a', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-14T13:00:00.000Z'), visitorHash: 'b', path: '/', refererHost: 'google.com' },
      { ts: dateAt('2026-01-13T12:00:00.000Z'), visitorHash: 'c', path: '/', refererHost: 'x.com' },
      { ts: dateAt('2026-01-13T13:00:00.000Z'), visitorHash: 'd', path: '/', refererHost: null },
      { ts: dateAt('2026-01-13T14:00:00.000Z'), visitorHash: 'e', path: '/', refererHost: '' },
      // Outside the range.
      { ts: dateAt('2025-11-15T23:59:59.000Z'), visitorHash: 'f', path: '/', refererHost: 'old.com' },
    ])
    await refreshContinuousAggregates()

    const result = await queryCounters(db, { range: { startAt, endAt }, filters: {} })

    expect(result).toEqual({ visits: 5, visitors: 5, referers: 2 })
  })

  it('applies supported filter dimensions to hourly aggregates', async () => {
    const now = unixAt('2026-01-15T12:00:00.000Z')
    const startAt = now - 7 * DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-15T11:00:00.000Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: dateAt('2026-01-15T10:00:00.000Z'), visitorHash: 'b', path: '/post/1', country: 'CN' },
      { ts: dateAt('2026-01-14T12:00:00.000Z'), visitorHash: 'c', path: '/', country: 'US' },
    ])
    await refreshContinuousAggregates()

    const result = await queryCounters(db, {
      range: { startAt, endAt: now },
      filters: { country: 'US' },
    })

    expect(result).toEqual({ visits: 2, visitors: 2, referers: 0 })
  })

  it('applies supported filter dimensions to daily aggregates', async () => {
    const endAt = unixAt('2026-01-15T00:00:00.000Z')
    const startAt = endAt - 60 * DAY

    await db.insert(accessLog).values([
      { ts: dateAt('2026-01-14T12:00:00.000Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: dateAt('2026-01-14T13:00:00.000Z'), visitorHash: 'b', path: '/post/1', country: 'CN' },
      { ts: dateAt('2026-01-13T12:00:00.000Z'), visitorHash: 'c', path: '/', country: 'US' },
    ])
    await refreshContinuousAggregates()

    const result = await queryCounters(db, {
      range: { startAt, endAt },
      filters: { country: 'US' },
    })

    expect(result).toEqual({ visits: 2, visitors: 2, referers: 0 })
  })
})
