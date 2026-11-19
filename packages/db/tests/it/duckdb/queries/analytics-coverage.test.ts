import { queryExportRows } from '@kobato/db/duckdb/queries/export.ts'
import { queryHeatmap } from '@kobato/db/duckdb/queries/heatmap.ts'
import { queryMetric } from '@kobato/db/duckdb/queries/metric.ts'
import { queryRealtimeTail } from '@kobato/db/duckdb/queries/realtime.ts'
import { queryViews } from '@kobato/db/duckdb/queries/views.ts'
import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '@kobato/test/analytics-db.ts'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const handle = await createTestAnalyticsDb()

afterAll(async () => {
  await closeTestAnalyticsDb(handle)
})

beforeEach(async () => {
  await clearAccessEvents(handle)
})

function ts(iso: string): Date {
  return new Date(iso)
}

describe('analytics/views — queryViews', () => {
  it('returns empty points when no rows match', async () => {
    const now = Math.floor(Date.now() / 1000)
    const result = await queryViews(handle.reader, { range: { startAt: now - 3600, endAt: now } })
    expect(result.points).toEqual([])
    expect(result.unit).toBe('minute')
  })

  it('derives the unit from the range when not given', async () => {
    const minute = await queryViews(handle.reader, { range: { startAt: 0, endAt: 3600 } })
    expect(minute.unit).toBe('minute')
    const hour = await queryViews(handle.reader, { range: { startAt: 0, endAt: 24 * 3600 } })
    expect(hour.unit).toBe('hour')
    const day = await queryViews(handle.reader, { range: { startAt: 0, endAt: 7 * 24 * 3600 } })
    expect(day.unit).toBe('day')
  })

  it('returns minute-bucketed points for a sub-hour range', async () => {
    const start = ts('2026-01-15T11:00:00Z')
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:05:00Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: ts('2026-01-15T11:05:30Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: ts('2026-01-15T11:25:00Z'), visitorHash: 'b', path: '/', country: 'US' },
    ])
    const result = await queryViews(handle.reader, {
      range: { startAt: Math.floor(start.getTime() / 1000), endAt: Math.floor(start.getTime() / 1000) + 3600 },
    })
    expect(result.points).toEqual([
      { time: '2026-01-15 11:05', visits: 2, visitors: 1 },
      { time: '2026-01-15 11:25', visits: 1, visitors: 1 },
    ])
  })

  it('buckets in the client timezone, not UTC', async () => {
    await seedAccessEvents(handle, [{ ts: ts('2026-01-15T23:30:00Z'), visitorHash: 'a', path: '/', country: 'US' }])
    const range = {
      startAt: Math.floor(ts('2026-01-15T00:00:00Z').getTime() / 1000),
      endAt: Math.floor(ts('2026-01-17T00:00:00Z').getTime() / 1000),
    }
    const utc = await queryViews(handle.reader, { range, unit: 'day', clientTimezone: 'Etc/UTC' })
    expect(utc.points.map((p) => p.time)).toEqual(['2026-01-15'])
    const shanghai = await queryViews(handle.reader, { range, unit: 'day', clientTimezone: 'Asia/Shanghai' })
    expect(shanghai.points.map((p) => p.time)).toEqual(['2026-01-16'])
    expect(shanghai.clientTimezone).toBe('Asia/Shanghai')
  })

  it('falls back to Etc/UTC for an invalid clientTimezone', async () => {
    await seedAccessEvents(handle, [{ ts: ts('2026-01-15T23:30:00Z'), visitorHash: 'a', path: '/', country: 'US' }])
    const result = await queryViews(handle.reader, {
      range: {
        startAt: Math.floor(ts('2026-01-15T00:00:00Z').getTime() / 1000),
        endAt: Math.floor(ts('2026-01-17T00:00:00Z').getTime() / 1000),
      },
      unit: 'day',
      clientTimezone: 'Not/AZone',
    })
    expect(result.clientTimezone).toBe('Etc/UTC')
    expect(result.points.map((p) => p.time)).toEqual(['2026-01-15'])
  })
})

describe('analytics/realtime — queryRealtimeTail', () => {
  it('returns rows newer than sinceTs in descending order', async () => {
    await seedAccessEvents(handle, [
      {
        ts: ts('2026-01-15T11:00:00Z'),
        visitorHash: 'a',
        path: '/p1',
        country: 'US',
        city: 'NYC',
        browser: 'FF',
        os: 'Linux',
      },
      { ts: ts('2026-01-15T11:01:00Z'), visitorHash: 'b', path: '/p2' },
    ])
    const since = ts('2026-01-15T10:55:00Z')
    const result = await queryRealtimeTail(handle.reader, since, 10)
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result[0]!.path).toBe('/p2')
    expect(result[0]!.ts).toMatch(/^\d{4}-/)
    expect(result[1]!.country).toBe('US')
    expect(result[0]!.country).toBeNull()
  })

  it('returns an empty array when no rows match', async () => {
    const result = await queryRealtimeTail(handle.reader, new Date('2030-01-01T00:00:00Z'), 10)
    expect(result).toEqual([])
  })
})

describe('analytics/metric — queryMetric', () => {
  it('groups visits by metric column', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: ts('2026-01-15T11:01:00Z'), visitorHash: 'b', path: '/', country: 'US' },
      { ts: ts('2026-01-15T11:02:00Z'), visitorHash: 'c', path: '/', country: 'CN' },
      { ts: ts('2026-01-15T11:03:00Z'), visitorHash: 'd', path: '/', country: '' },
    ])
    const now = Math.floor(Date.now() / 1000)
    const excluded = await queryMetric(handle.reader, { range: { startAt: 0, endAt: now } }, 'country')
    expect(excluded.length).toBeGreaterThan(0)
    expect(excluded.find((r) => r.name === '(unknown)')).toBeUndefined()

    const included = await queryMetric(
      handle.reader,
      { range: { startAt: 0, endAt: now }, includeUnknown: true },
      'country',
    )
    expect(included.find((r) => r.name === '(unknown)')).toBeDefined()
  })

  it('groups referers by host (blob3), not the full referer', async () => {
    await seedAccessEvents(handle, [
      {
        ts: ts('2026-01-15T11:00:00Z'),
        visitorHash: 'a',
        path: '/',
        referer: 'https://google.com/x',
        refererHost: 'google.com',
        country: 'US',
      },
      {
        ts: ts('2026-01-15T11:01:00Z'),
        visitorHash: 'b',
        path: '/',
        referer: 'https://google.com/y',
        refererHost: 'google.com',
        country: 'US',
      },
    ])
    const now = Math.floor(Date.now() / 1000)
    const result = await queryMetric(handle.reader, { range: { startAt: 0, endAt: now } }, 'referer')
    expect(result).toEqual([{ name: 'google.com', visits: 2, visitors: 2 }])
  })
})

describe('analytics/heatmap — queryHeatmap', () => {
  it('returns ISO weekday/hour buckets in the client timezone', async () => {
    // 2026-01-15T23:30:00Z: Thursday 23:30 UTC; Friday 07:30 in Asia/Shanghai.
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T23:30:00Z'), visitorHash: 'a', path: '/', country: 'US' },
      { ts: ts('2026-01-15T23:45:00Z'), visitorHash: 'b', path: '/', country: 'US' },
    ])
    const range = { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } }

    const utc = await queryHeatmap(handle.reader, { ...range, clientTimezone: 'Etc/UTC' })
    expect(utc).toEqual([{ weekday: 4, hour: 23, visits: 2, visitors: 2 }])

    const shanghai = await queryHeatmap(handle.reader, { ...range, clientTimezone: 'Asia/Shanghai' })
    expect(shanghai).toEqual([{ weekday: 5, hour: 7, visits: 2, visitors: 2 }])
  })
})

describe('analytics/export — queryExportRows', () => {
  it('aggregates per-path views/visitors/referers', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/hello', refererHost: 'google.com', country: 'US' },
      { ts: ts('2026-01-15T11:01:00Z'), visitorHash: 'a', path: '/hello', refererHost: 'google.com', country: 'US' },
      { ts: ts('2026-01-15T11:02:00Z'), visitorHash: 'b', path: '/world', country: 'US' },
    ])
    const rows = await queryExportRows(handle.reader, { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } })
    expect(rows).toEqual([
      { path: '/hello', views: 2, visitors: 1, referers: 1 },
      { path: '/world', views: 1, visitors: 1, referers: 0 },
    ])
  })

  it('keeps quoting-relevant path characters raw (CSV escaping stays server-side)', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/weird,"path"', country: 'US' },
    ])
    const rows = await queryExportRows(handle.reader, { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } })
    expect(rows).toEqual([{ path: '/weird,"path"', views: 1, visitors: 1, referers: 0 }])
  })

  it('keeps formula-triggering path characters raw (formula neutralization stays server-side)', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '=HYPERLINK("https://evil.example")', country: 'US' },
    ])
    const rows = await queryExportRows(handle.reader, { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } })
    expect(rows).toEqual([{ path: '=HYPERLINK("https://evil.example")', views: 1, visitors: 1, referers: 0 }])
  })

  it('honours the query limit', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/a', country: 'US' },
      { ts: ts('2026-01-15T11:01:00Z'), visitorHash: 'a', path: '/a', country: 'US' },
      { ts: ts('2026-01-15T11:02:00Z'), visitorHash: 'b', path: '/a', country: 'US' },
      { ts: ts('2026-01-15T11:03:00Z'), visitorHash: 'c', path: '/b', country: 'US' },
      { ts: ts('2026-01-15T11:04:00Z'), visitorHash: 'c', path: '/b', country: 'US' },
      { ts: ts('2026-01-15T11:05:00Z'), visitorHash: 'd', path: '/c', country: 'US' },
    ])
    const rows = await queryExportRows(handle.reader, {
      range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) },
      limit: 2,
    })
    expect(rows).toEqual([
      { path: '/a', views: 3, visitors: 2, referers: 0 },
      { path: '/b', views: 2, visitors: 1, referers: 0 },
    ])
  })
})
