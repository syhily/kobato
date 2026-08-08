import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'
import type { RequestFacts } from '@/server/infra/http/request-facts'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb } from '#/_helpers/analytics-db'
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

const { trackPageView, KOBATO_AID_COOKIE } = await import('@/server/domains/analytics/track')

function makeFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    path: '/post/1',
    isDataRequest: false,
    userAgent: null,
    referer: null,
    acceptLanguage: null,
    purpose: null,
    cookie: null,
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
  await clearAccessLog(analyticsHandle)
  __clearLogCaptureForTests()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(async () => {
  // Flush BEFORE dropping the batchers so no pending event lands mid-next-test.
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
  const result = await analyticsHandle.reader.runAndReadAll('SELECT * FROM access_log')
  return result.getRowObjects()
}

describe('analytics/track — trackPageView', () => {
  it('returns early when the admin visitor is excluded by settings — neither signal writes', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: false, geoipAutoUpdate: false } },
    })
    await ensureMetric(db, POST_TARGET)
    await trackPageView(makeFacts(), POST_TARGET, { isAdmin: true })
    expect(await pvOfPostTarget()).toBe(0)
    expect(await accessLogRows()).toHaveLength(0)
  })

  it('records an admin visit on both signals when trackAdmin is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: true, keepBotRows: false, geoipAutoUpdate: false } },
    })
    await ensureMetric(db, POST_TARGET)
    await trackPageView(makeFacts(), POST_TARGET, { isAdmin: true })
    expect(await pvOfPostTarget()).toBe(1)
    expect(await accessLogRows()).toHaveLength(1)
  })

  it('skips prefetch requests — neither signal writes', async () => {
    await ensureMetric(db, POST_TARGET)
    await trackPageView(makeFacts({ purpose: 'prefetch' }), POST_TARGET)
    expect(await pvOfPostTarget()).toBe(0)
    expect(await accessLogRows()).toHaveLength(0)
  })

  it('skips bot traffic in the time-series when keepBotRows is false, but still bumps the counter', async () => {
    await ensureMetric(db, POST_TARGET)
    await trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)
    expect(await pvOfPostTarget()).toBe(1)
    expect(await accessLogRows()).toHaveLength(0)
  })

  it('records bot traffic when keepBotRows is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: true, geoipAutoUpdate: false } },
    })
    await trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)
    const rows = await accessLogRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.is_bot).toBe(true)
  })

  it('records a normal visit on both signals', async () => {
    await ensureMetric(db, POST_TARGET)
    await trackPageView(makeFacts({ userAgent: CHROME_UA }), POST_TARGET)
    expect(await pvOfPostTarget()).toBe(1)
    const rows = await accessLogRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.path).toBe('/post/1')
    expect(rows[0]!.entity_type).toBe('post')
    expect(rows[0]!.entity_id).toBe(1n)
  })

  it('skips only the counter when the target is null (homepage)', async () => {
    await trackPageView(makeFacts({ userAgent: CHROME_UA }), null)
    // No metric row is ever created for a null target.
    expect(await db.select().from(metric)).toHaveLength(0)
    const rows = await accessLogRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.entity_type).toBeNull()
    expect(rows[0]!.entity_id).toBeNull()
  })

  it('exports KOBATO_AID_COOKIE constant', () => {
    expect(KOBATO_AID_COOKIE).toBe('kobato_aid')
  })

  it('never throws on internal failure (defensive try/catch)', async () => {
    // Batchers down: the real throw is swallowed by track's catch.
    resetAllBatchers()
    await expect(trackPageView(makeFacts({ userAgent: CHROME_UA }), POST_TARGET)).resolves.toBeUndefined()
    expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
  })
})
