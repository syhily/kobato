import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '#/_helpers/analytics-db'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { enrichEvent } from '@/server/domains/analytics/enrich'
import { queryExportCsv } from '@/server/domains/analytics/services/export'
import { queryHeatmap } from '@/server/domains/analytics/services/heatmap'
import { queryMetric } from '@/server/domains/analytics/services/metric'
import { parseAnalyticsSearch } from '@/server/domains/analytics/services/query-filter'
import { queryRealtimeTail } from '@/server/domains/analytics/services/realtime'
import { queryViews } from '@/server/domains/analytics/services/views'

const handle = await createTestAnalyticsDb()

afterAll(async () => {
  await closeTestAnalyticsDb(handle)
})

beforeEach(async () => {
  await clearAccessEvents(handle)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

function ts(iso: string): Date {
  return new Date(iso)
}

describe('analytics/query-filter — parseAnalyticsSearch', () => {
  it('parses explicit startAt/endAt as unix seconds', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '1000', endAt: '2000' }))
    expect(input.range).toEqual({ startAt: 1000, endAt: 2000 })
  })

  it('falls back to last-7d when startAt/endAt are not finite numbers', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: 'abc', endAt: 'xyz' }))
    expect(input.range.startAt).toBeLessThan(input.range.endAt)
  })

  it('falls back to last-7d when endAt is not strictly greater than startAt', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '2000', endAt: '1000' }))
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('computes range from a recognized preset', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ preset: 'today' }))
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('falls back to last-7d for an unknown preset', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ preset: 'bogus' }))
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('falls back to last-7d with no params at all', () => {
    const input = parseAnalyticsSearch(new URLSearchParams())
    expect(input.range.endAt).toBeGreaterThan(input.range.startAt)
  })

  it('parses direct dimension params (Slite-style)', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ country: 'US,CN', browser: 'Chrome' }))
    expect(input.country).toBe('US,CN')
    expect(input.browser).toBe('Chrome')
  })

  it('drops poisonous dimension params but keeps the range', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ startAt: '1000', endAt: '2000', country: 'safe\nunsafe' }))
    expect(input.range).toEqual({ startAt: 1000, endAt: 2000 })
    expect(input.country).toBeUndefined()
  })

  it('extracts entityType and entityId when both are valid', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'post', entityId: '42' }))
    expect(input.entityType).toBe('post')
    expect(input.entityId).toBe(42)
  })

  it('ignores an unknown entityType', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'tag', entityId: '1' }))
    expect(input.entityType).toBeUndefined()
  })

  it('parses unit and clientTimezone', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ unit: 'hour', clientTimezone: 'Asia/Shanghai' }))
    expect(input.unit).toBe('hour')
    expect(input.clientTimezone).toBe('Asia/Shanghai')
  })
})

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
      { ts: ts('2026-01-15T11:05:00Z'), visitorHash: 'a', path: '/' },
      { ts: ts('2026-01-15T11:05:30Z'), visitorHash: 'a', path: '/' },
      { ts: ts('2026-01-15T11:25:00Z'), visitorHash: 'b', path: '/' },
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
    // 2026-01-15T23:30:00Z is 2026-01-16 07:30 in Asia/Shanghai.
    await seedAccessEvents(handle, [{ ts: ts('2026-01-15T23:30:00Z'), visitorHash: 'a', path: '/' }])
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
    await seedAccessEvents(handle, [{ ts: ts('2026-01-15T23:30:00Z'), visitorHash: 'a', path: '/' }])
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
    // Empty blob slots map back to null on the wire.
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
    const result = await queryMetric(handle.reader, { range: { startAt: 0, endAt: now } }, 'country')
    expect(result.length).toBeGreaterThan(0)
    // Empty-string rows show up as '(unknown)'.
    const unknown = result.find((r) => r.name === '(unknown)')
    expect(unknown).toBeDefined()
  })

  it('groups referers by host (blob3), not the full referer', async () => {
    await seedAccessEvents(handle, [
      {
        ts: ts('2026-01-15T11:00:00Z'),
        visitorHash: 'a',
        path: '/',
        referer: 'https://google.com/x',
        refererHost: 'google.com',
      },
      {
        ts: ts('2026-01-15T11:01:00Z'),
        visitorHash: 'b',
        path: '/',
        referer: 'https://google.com/y',
        refererHost: 'google.com',
      },
    ])
    const now = Math.floor(Date.now() / 1000)
    const result = await queryMetric(handle.reader, { range: { startAt: 0, endAt: now } }, 'referer')
    expect(result).toEqual([{ name: 'google.com', visits: 2, visitors: 2 }])
  })

  // Metric-type validation lives at the wire boundary only (the zod
  // enum in analytics.controller) — pinned in
  // tests/it/server/http/controllers/analytics.test.ts.
})

describe('analytics/heatmap — queryHeatmap', () => {
  it('returns ISO weekday/hour buckets in the client timezone', async () => {
    // 2026-01-15T23:30:00Z: Thursday 23:30 UTC; Friday 07:30 in Asia/Shanghai.
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T23:30:00Z'), visitorHash: 'a', path: '/' },
      { ts: ts('2026-01-15T23:45:00Z'), visitorHash: 'b', path: '/' },
    ])
    const range = { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } }

    const utc = await queryHeatmap(handle.reader, { ...range, clientTimezone: 'Etc/UTC' })
    expect(utc).toEqual([{ weekday: 4, hour: 23, visits: 2, visitors: 2 }])

    const shanghai = await queryHeatmap(handle.reader, { ...range, clientTimezone: 'Asia/Shanghai' })
    expect(shanghai).toEqual([{ weekday: 5, hour: 7, visits: 2, visitors: 2 }])
  })
})

describe('analytics/export — queryExportCsv', () => {
  it('exports per-path views/visitors/referers as CSV text', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/hello', refererHost: 'google.com' },
      { ts: ts('2026-01-15T11:01:00Z'), visitorHash: 'a', path: '/hello', refererHost: 'google.com' },
      { ts: ts('2026-01-15T11:02:00Z'), visitorHash: 'b', path: '/world' },
    ])
    const csv = await queryExportCsv(handle.reader, { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } })
    expect(csv).toBe(['path,views,visitors,referers', '/hello,2,1,1', '/world,1,1,0', ''].join('\r\n'))
  })

  it('quotes cells carrying commas or quotes', async () => {
    await seedAccessEvents(handle, [{ ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/weird,"path"' }])
    const csv = await queryExportCsv(handle.reader, { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } })
    expect(csv).toContain('"/weird,""path""",1,1,0')
  })

  it('neutralizes formula-triggering path cells', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '=HYPERLINK("https://evil.example")' },
    ])
    const csv = await queryExportCsv(handle.reader, { range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) } })
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")",1,1,0`)
  })

  it('honours the query limit', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/a' },
      { ts: ts('2026-01-15T11:01:00Z'), visitorHash: 'a', path: '/a' },
      { ts: ts('2026-01-15T11:02:00Z'), visitorHash: 'b', path: '/a' },
      { ts: ts('2026-01-15T11:03:00Z'), visitorHash: 'c', path: '/b' },
      { ts: ts('2026-01-15T11:04:00Z'), visitorHash: 'c', path: '/b' },
      { ts: ts('2026-01-15T11:05:00Z'), visitorHash: 'd', path: '/c' },
    ])
    const csv = await queryExportCsv(handle.reader, {
      range: { startAt: 0, endAt: Math.floor(Date.now() / 1000) },
      limit: 2,
    })
    expect(csv).toBe(['path,views,visitors,referers', '/a,3,2,0', '/b,2,1,0', ''].join('\r\n'))
  })
})

describe('analytics/enrich — enrichEvent', () => {
  it('hashes the IP, parses referer + language, and detects bots', async () => {
    const event = await enrichEvent({
      ts: new Date(),
      ip: '127.0.0.1',
      ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)',
      path: '/post/1',
      referer: 'https://example.com/page',
      acceptLanguage: 'zh-CN,zh;q=0.9,en;q=0.8',
      target: { type: 'post', ownerId: 1 },
    })
    expect(event.visitorHash).toMatch(/^[a-f0-9]{32}$/)
    expect(event.refererHost).toBe('example.com')
    expect(event.language).toBe('zh-CN')
    expect(event.isBot).toBe(true)
    expect(event.entityType).toBe('post')
    expect(event.entityId).toBe(1)
  })

  it('fills os/browser/browserType/device/deviceType from the user agent', async () => {
    const event = await enrichEvent({
      ts: new Date(),
      ip: '127.0.0.1',
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      path: '/',
      referer: null,
      acceptLanguage: null,
      target: null,
    })
    expect(event.os).toBe('iOS')
    expect(event.browser).toBe('Mobile Safari')
    expect(event.device).toBe('iPhone')
    expect(event.deviceType).toBe('mobile')
    expect(event.isBot).toBe(false)
  })

  it('marks crawler/fetcher browser types as bots even when the hand-rolled matcher misses them', async () => {
    // ia_archiver trips the ua-parser crawler extension, not kobato's is-bot list.
    const event = await enrichEvent({
      ts: new Date(),
      ip: '127.0.0.1',
      ua: 'ia_archiver',
      path: '/',
      referer: null,
      acceptLanguage: null,
      target: null,
    })
    expect(event.browserType).toBe('crawler')
    expect(event.isBot).toBe(true)
  })

  it('strips query, hash and userinfo from the persisted referer', async () => {
    const event = await enrichEvent({
      ts: new Date(),
      ip: '127.0.0.1',
      ua: '',
      path: '/',
      referer: 'https://user:pw@example.com/page?token=secret&q=1#frag',
      acceptLanguage: null,
      target: null,
    })
    expect(event.referer).toBe('https://example.com/page')
    expect(event.referer).not.toContain('token')
    expect(event.refererHost).toBe('example.com')
  })

  it('returns null fields when referer is malformed', async () => {
    const event = await enrichEvent({
      ts: new Date(),
      ip: '',
      ua: 'curl/7.0',
      path: '/',
      referer: 'not-a-url',
      acceptLanguage: null,
      target: null,
    })
    expect(event.refererHost).toBeNull()
    expect(event.referer).toBeNull()
    expect(event.language).toBeNull()
  })

  it('returns null refererHost when referer is missing', async () => {
    const event = await enrichEvent({
      ts: new Date(),
      ip: '1.1.1.1',
      ua: '',
      path: '/',
      referer: null,
      acceptLanguage: null,
      target: null,
    })
    expect(event.refererHost).toBeNull()
    expect(event.isBot).toBe(false)
  })
})
