import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RequestFacts } from '@/server/infra/http/request-facts'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'

// `trackPageView` is the single owner of "what counts as a view": one gate
// (prefetch via `facts.purpose`, admin exemption with the `trackAdmin`
// settings override) covering BOTH signals — the per-entity counter
// (`bumpPageView`) and the time-series (`pushAccessEvent`). These tests
// pin the fan-out: a rejected view writes neither signal, a homepage view
// (null target) writes only the time-series, and a normal view writes both.
const pushAccessEvent = vi.fn()
vi.mock('@/server/domains/analytics/services/batcher', () => ({ pushAccessEvent }))
const bumpPageView = vi.fn()
vi.mock('@/server/domains/analytics/services/pv-batcher', () => ({ bumpPageView }))

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

const POST_TARGET = { type: 'post' as const, ownerId: 1n }
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

beforeEach(async () => {
  vi.clearAllMocks()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('analytics/track — trackPageView', () => {
  it('returns early when the admin visitor is excluded by settings — neither signal writes', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: false } },
    })
    await trackPageView(makeFacts(), POST_TARGET, { isAdmin: true })
    expect(bumpPageView).not.toHaveBeenCalled()
    expect(pushAccessEvent).not.toHaveBeenCalled()
  })

  it('records an admin visit on both signals when trackAdmin is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: true, keepBotRows: false } },
    })
    await trackPageView(makeFacts(), POST_TARGET, { isAdmin: true })
    expect(bumpPageView).toHaveBeenCalledTimes(1)
    expect(bumpPageView).toHaveBeenCalledWith(POST_TARGET)
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
  })

  it('skips prefetch requests — neither signal writes', async () => {
    await trackPageView(makeFacts({ purpose: 'prefetch' }), POST_TARGET)
    expect(bumpPageView).not.toHaveBeenCalled()
    expect(pushAccessEvent).not.toHaveBeenCalled()
  })

  it('skips bot traffic in the time-series when keepBotRows is false, but still bumps the counter', async () => {
    await trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)
    expect(bumpPageView).toHaveBeenCalledTimes(1)
    expect(pushAccessEvent).not.toHaveBeenCalled()
  })

  it('records bot traffic when keepBotRows is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: true } },
    })
    await trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
  })

  it('records a normal visit on both signals', async () => {
    await trackPageView(makeFacts({ userAgent: CHROME_UA }), POST_TARGET)
    expect(bumpPageView).toHaveBeenCalledTimes(1)
    expect(bumpPageView).toHaveBeenCalledWith(POST_TARGET)
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
    const event = pushAccessEvent.mock.calls[0]![0]
    expect(event.path).toBe('/post/1')
    expect(event.entityType).toBe('post')
    expect(event.entityId).toBe(1n)
  })

  it('skips only the counter when the target is null (homepage)', async () => {
    await trackPageView(makeFacts({ userAgent: CHROME_UA }), null)
    expect(bumpPageView).not.toHaveBeenCalled()
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
  })

  it('exports KOBATO_AID_COOKIE constant', () => {
    expect(KOBATO_AID_COOKIE).toBe('kobato_aid')
  })

  it('never throws on internal failure (defensive try/catch)', async () => {
    pushAccessEvent.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    await expect(trackPageView(makeFacts({ userAgent: CHROME_UA }), null)).resolves.toBeUndefined()
  })
})
