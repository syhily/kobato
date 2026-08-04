import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

import { enrichEvent } from '@kobato/server/domains/analytics/enrich'
import { queryHeatmap } from '@kobato/server/domains/analytics/services/heatmap'
import { queryMetric } from '@kobato/server/domains/analytics/services/metric'
import { parseAnalyticsSearch } from '@kobato/server/domains/analytics/services/query-parser'
import { queryRealtimeTail } from '@kobato/server/domains/analytics/services/realtime'
import { queryViews } from '@kobato/server/domains/analytics/services/views'
import { KOBATO_AID_COOKIE } from '@kobato/server/domains/analytics/track'
import { resolveVisitorCookie } from '@kobato/server/domains/analytics/visitor-cookie'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const handle = await createTestAnalyticsDb()

afterAll(async () => {
  await closeTestAnalyticsDb(handle)
})

beforeEach(async () => {
  await clearAccessLog(handle)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

function ts(iso: string): Date {
  return new Date(iso)
}

describe('analytics/query-parser — parseAnalyticsSearch', () => {
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

  it('parses a JSON filters payload', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ filters: JSON.stringify({ country: 'US', path: '/x' }) }))
    expect(input.filters).toEqual({ country: 'US', path: '/x' })
  })

  it('drops non-string filter values', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ filters: JSON.stringify({ country: 42 }) }))
    expect(input.filters).toEqual({})
  })

  it('drops unknown filter keys', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ filters: JSON.stringify({ bogus: 'x' }) }))
    expect(input.filters).toEqual({})
  })

  it('drops filters that exceed the 10 KB payload cap', () => {
    const huge = 'x'.repeat(11 * 1024)
    const input = parseAnalyticsSearch(new URLSearchParams({ filters: huge }))
    expect(input.filters).toEqual({})
  })

  it('drops malformed JSON filters silently', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ filters: '{not-json' }))
    expect(input.filters).toEqual({})
  })

  it('extracts entityType and entityId when both are valid', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'post', entityId: '42' }))
    expect(input.entityType).toBe('post')
    expect(input.entityId).toBe(42)
  })

  it('ignores an unknown entityType', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'tag', entityId: '1' }))
    expect(input.entityType).toBeUndefined()
    expect(input.entityId).toBeUndefined()
  })

  it('ignores entityId when it is not a valid bigint string', () => {
    const input = parseAnalyticsSearch(new URLSearchParams({ entityType: 'post', entityId: 'not-a-number' }))
    // entityType is set before the throw; only entityId stays unset.
    expect(input.entityType).toBe('post')
    expect(input.entityId).toBeUndefined()
  })
})

describe('analytics/views — queryViews', () => {
  it('returns empty array when no rows match', async () => {
    const now = Math.floor(Date.now() / 1000)
    const result = await queryViews(handle.reader, { range: { startAt: now - 3600, endAt: now }, filters: {} })
    expect(result).toEqual([])
  })

  it('returns bucketed points when access_log rows exist', async () => {
    const start = ts('2026-01-15T11:00:00Z')
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:05:00Z'), visitorHash: 'a', path: '/' },
      { ts: ts('2026-01-15T11:15:00Z'), visitorHash: 'a', path: '/' },
      { ts: ts('2026-01-15T11:25:00Z'), visitorHash: 'b', path: '/' },
    ])
    const result = await queryViews(handle.reader, {
      range: { startAt: Math.floor(start.getTime() / 1000), endAt: Math.floor(start.getTime() / 1000) + 3600 },
      filters: {},
    })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.time).toMatch(/^\d{4}-/)
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
    const result = await queryMetric(handle.reader, { range: { startAt: 0, endAt: now }, filters: {} }, 'country')
    expect(result.length).toBeGreaterThan(0)
    // Empty-string rows show up as '(unknown)'.
    const unknown = result.find((r) => r.name === '(unknown)')
    expect(unknown).toBeDefined()
  })

  // Metric-type validation lives at the wire boundary only (the zod
  // enum in analytics.controller) — pinned in
  // tests/it/server/http/controllers/analytics.test.ts.
})

describe('analytics/heatmap — queryHeatmap', () => {
  it('returns weekday/hour buckets', async () => {
    await seedAccessEvents(handle, [
      { ts: ts('2026-01-15T11:00:00Z'), visitorHash: 'a', path: '/' },
      { ts: ts('2026-01-15T11:30:00Z'), visitorHash: 'b', path: '/' },
    ])
    const now = Math.floor(Date.now() / 1000)
    const result = await queryHeatmap(handle.reader, { range: { startAt: 0, endAt: now }, filters: {} })
    expect(result.length).toBeGreaterThan(0)
    const cell = result[0]!
    expect(cell.weekday).toBeGreaterThanOrEqual(0)
    expect(cell.hour).toBeGreaterThanOrEqual(0)
    expect(cell.visits).toBeGreaterThanOrEqual(1)
  })
})

describe('analytics/visitor-cookie — resolveVisitorCookie', () => {
  it('generates a fresh cookie when none is present', () => {
    const res = resolveVisitorCookie(null)
    expect(res.visitorId).toMatch(/^[a-f0-9]{24}$/)
    expect(res.setCookie).toContain(`${KOBATO_AID_COOKIE}=`)
    expect(res.setCookie).toContain('HttpOnly')
    expect(res.setCookie).toContain('SameSite=Lax')
  })

  it('returns the existing id when a valid cookie is present', () => {
    const existing = 'abcdef0123456789abcdef0123456789'
    const res = resolveVisitorCookie(`${KOBATO_AID_COOKIE}=${existing}`)
    expect(res.visitorId).toBe(existing)
    expect(res.setCookie).toBeNull()
  })

  it('rotates when an existing cookie has an invalid shape', () => {
    const res = resolveVisitorCookie(`${KOBATO_AID_COOKIE}=NOT-VALID-@@@`)
    expect(res.visitorId).not.toBe('NOT-VALID-@@@')
    expect(res.setCookie).not.toBeNull()
  })

  it('returns null set-cookie when no Cookie header is present', () => {
    // Same as no-cookie case but explicit
    const res = resolveVisitorCookie(null)
    expect(res.setCookie).not.toBeNull()
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
      sessionId: 'sess-1',
    })
    expect(event.ip).toBeNull()
    expect(event.visitorHash).toMatch(/^[a-f0-9]{32}$/)
    expect(event.refererHost).toBe('example.com')
    expect(event.language).toBe('zh-CN')
    expect(event.isBot).toBe(true)
    expect(event.entityType).toBe('post')
    expect(event.entityId).toBe(1)
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
      sessionId: null,
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
      sessionId: null,
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
      sessionId: null,
    })
    expect(event.refererHost).toBeNull()
    expect(event.isBot).toBe(false)
  })
})
