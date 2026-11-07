import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { TrackPageViewOptions } from '@/server/domains/analytics/track'
import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { EntityTarget } from '@/server/infra/db/target'
import type { RequestFacts } from '@/server/infra/http/request-facts'

import { clearAccessEvents, closeTestAnalyticsDb, createTestAnalyticsDb } from '#/_helpers/analytics-db'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAccessLog } from '@/server/domains/analytics/services/batcher'
import { flushPageViews } from '@/server/domains/analytics/services/pv-batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { ensureMetric, findMetricByTarget } from '@/server/infra/db/operations/metric'
import { metric } from '@/server/infra/db/schema/metric'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

// `trackPageView` gates both signals (per-entity counter + time-series)
// against the real engine: real `metric` table + adopted DuckDB sidecar.
// No mocks.

const db = getTestDb()

const analyticsHandle: AnalyticsHandle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analyticsHandle)

const { flushTrackedEvents, trackPageView } = await import('@/server/domains/analytics/track')

/** trackPageView is fire-and-forget by design; settle the enrich → push tail. */
async function track(
  facts: RequestFacts,
  target: EntityTarget | null,
  options?: TrackPageViewOptions,
): Promise<string | null> {
  const id = trackPageView(facts, target, options)
  await flushTrackedEvents()
  return id
}

function makeFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    analyticsEventId: '00000000-0000-4000-8000-0000000000ab',
    path: '/post/1',
    isDataRequest: false,
    userAgent: null,
    referer: null,
    acceptLanguage: null,
    purpose: null,
    cookie: null,
    clientHints: null,
    ...overrides,
  }
}

const POST_TARGET = { type: 'post' as const, ownerId: 1 }
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  await clearAccessEvents(analyticsHandle)
  await analyticsHandle.writer.run('DELETE FROM device_env_server')
  __clearLogCaptureForTests()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(async () => {
  // Flush BEFORE dropping the batchers so no pending event lands mid-next-test.
  await flushTrackedEvents()
  await flushPageViews()
  await flushAccessLog()
  resetAllBatchers()
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

/** Stored pv for POST_TARGET after a flush (0 when the row never landed). */
async function pvOfPostTarget(): Promise<number> {
  await flushPageViews()
  const row = await findMetricByTarget(db, POST_TARGET)
  return row?.pv ?? 0
}

async function accessLogRows(): Promise<Record<string, unknown>[]> {
  await flushAccessLog()
  const result = await analyticsHandle.reader.runAndReadAll('SELECT * FROM access_events')
  return result.getRowObjects()
}

async function deviceEnvRows(): Promise<Record<string, unknown>[]> {
  await flushAccessLog()
  const result = await analyticsHandle.reader.runAndReadAll(`
    SELECT
      event_id::VARCHAR AS eventId,
      ua_full_version AS uaFullVersion,
      platform,
      platform_version AS platformVersion,
      model,
      mobile,
      brands,
      arch,
      bitness,
      form_factors AS formFactors,
      accept_language AS acceptLanguage
    FROM device_env_server
  `)
  return result.getRowObjects()
}

describe('analytics/track — trackPageView', () => {
  it('returns early when the admin visitor is excluded by settings — neither signal writes', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: false, geoipAutoUpdate: false } },
    })
    await ensureMetric(db, POST_TARGET)
    expect(await track(makeFacts(), POST_TARGET, { isAdmin: true })).toBeNull()
    expect(await pvOfPostTarget()).toBe(0)
    expect(await accessLogRows()).toHaveLength(0)
  })

  it('records an admin visit on both signals when trackAdmin is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: true, keepBotRows: false, geoipAutoUpdate: false } },
    })
    await ensureMetric(db, POST_TARGET)
    await track(makeFacts(), POST_TARGET, { isAdmin: true })
    expect(await pvOfPostTarget()).toBe(1)
    expect(await accessLogRows()).toHaveLength(1)
  })

  it('skips prefetch requests — neither signal writes', async () => {
    await ensureMetric(db, POST_TARGET)
    expect(await track(makeFacts({ purpose: 'prefetch' }), POST_TARGET)).toBeNull()
    expect(await pvOfPostTarget()).toBe(0)
    expect(await accessLogRows()).toHaveLength(0)
  })

  it('skips bot traffic in the time-series when keepBotRows is false, but still bumps the counter', async () => {
    await ensureMetric(db, POST_TARGET)
    expect(await track(makeFacts({ userAgent: BOT_UA }), POST_TARGET)).toBeNull()
    expect(await pvOfPostTarget()).toBe(1)
    expect(await accessLogRows()).toHaveLength(0)
  })

  it('records bot traffic when keepBotRows is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: true, geoipAutoUpdate: false } },
    })
    await track(makeFacts({ userAgent: BOT_UA }), POST_TARGET)
    const rows = await accessLogRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.is_bot).toBe(true)
  })

  it('records a normal visit on both signals with the request event id', async () => {
    await ensureMetric(db, POST_TARGET)
    const eventId = '00000000-0000-4000-8000-0000000000cd'
    expect(await track(makeFacts({ userAgent: CHROME_UA, analyticsEventId: eventId }), POST_TARGET)).toBe(eventId)

    expect(await pvOfPostTarget()).toBe(1)
    await flushAccessLog()
    const rows = await analyticsHandle.reader.runAndReadAll(
      'SELECT event_id::VARCHAR AS eventId, blob1 AS path, index1 FROM access_events',
    )
    expect(rows.getRowObjects()).toEqual([{ eventId, path: '/post/1', index1: 'post:1' }])

    // The sidecar row joins on the same id.
    expect(await deviceEnvRows()).toEqual([
      {
        eventId,
        uaFullVersion: '',
        platform: '',
        platformVersion: '',
        model: '',
        mobile: null,
        brands: '',
        arch: '',
        bitness: '',
        formFactors: '',
        acceptLanguage: '',
      },
    ])
  })

  it('persists the UA-CH high-entropy values and the full accept-language list', async () => {
    const longAcceptLanguage = 'zh-CN,zh;q=0.9,' + 'x'.repeat(300)
    await track(
      makeFacts({
        userAgent: CHROME_UA,
        acceptLanguage: longAcceptLanguage,
        clientHints: {
          model: 'MacBook Pro',
          platform: '"macOS"',
          platformVersion: '15.1.0',
          mobile: '?0',
          brands: '"Chromium";v="141.0.7390.55"',
          fullVersion: '141.0.7390.55',
          arch: '"arm"',
          bitness: '64',
          formFactors: '"Desktop", "Laptop"',
        },
      }),
      null,
    )

    const [row] = await deviceEnvRows()
    expect(row).toMatchObject({
      uaFullVersion: '141.0.7390.55',
      platform: '"macOS"',
      platformVersion: '15.1.0',
      model: 'MacBook Pro',
      mobile: false,
      brands: '"Chromium";v="141.0.7390.55"',
      arch: '"arm"',
      bitness: '64',
      formFactors: '"Desktop", "Laptop"',
    })
    expect(String(row!.acceptLanguage)).toHaveLength(256)
    expect(String(row!.acceptLanguage).startsWith('zh-CN,zh;q=0.9,')).toBe(true)
  })

  it('skips only the counter when the target is null (homepage)', async () => {
    await track(makeFacts({ userAgent: CHROME_UA }), null)
    // No metric row is ever created for a null target.
    expect(await db.select().from(metric)).toHaveLength(0)
    const rows = await accessLogRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.index1).toBe('')
  })

  it('never throws on internal failure (defensive try/catch)', async () => {
    // Batchers down, no counter bump (null target): the sync path still
    // returns the id, and the async push failure is swallowed + logged.
    resetAllBatchers()
    expect(await track(makeFacts({ userAgent: CHROME_UA }), null)).toBe('00000000-0000-4000-8000-0000000000ab')
    expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
  })
})
