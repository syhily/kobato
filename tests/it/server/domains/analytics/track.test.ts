import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RequestFacts } from '@/server/infra/http/request-facts'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { flushWorkerRedis } from '#/_helpers/redis'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'

const pushAccessEvent = vi.fn()
vi.mock('@/server/domains/analytics/repos/batcher', () => ({ pushAccessEvent }))

const { trackAccess, KOBATO_AID_COOKIE } = await import('@/server/domains/analytics/track')

function makeFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    path: '/post/1',
    userAgent: null,
    referer: null,
    acceptLanguage: null,
    purpose: null,
    cookie: null,
    ...overrides,
  }
}

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

beforeEach(async () => {
  vi.clearAllMocks()
  await flushWorkerRedis()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('analytics/track — trackAccess', () => {
  it('returns early when the admin visitor is excluded by settings', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: false } },
    })
    await trackAccess(makeFacts(), { type: 'post', ownerId: 1n }, { isAdmin: true })
    expect(pushAccessEvent).not.toHaveBeenCalled()
  })

  it('records an admin visit when trackAdmin is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: true, keepBotRows: false } },
    })
    await trackAccess(makeFacts(), { type: 'post', ownerId: 1n }, { isAdmin: true })
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
  })

  it('skips prefetch requests', async () => {
    await trackAccess(makeFacts({ purpose: 'prefetch' }), null)
    expect(pushAccessEvent).not.toHaveBeenCalled()
  })

  it('skips bot traffic when keepBotRows is false', async () => {
    await trackAccess(makeFacts({ userAgent: BOT_UA }), null)
    expect(pushAccessEvent).not.toHaveBeenCalled()
  })

  it('records bot traffic when keepBotRows is true', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      analytics: { analytics: { trackAdmin: false, keepBotRows: true } },
    })
    await trackAccess(makeFacts({ userAgent: BOT_UA }), null)
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
  })

  it('records a normal visit', async () => {
    await trackAccess(makeFacts({ userAgent: CHROME_UA }), { type: 'post', ownerId: 1n })
    expect(pushAccessEvent).toHaveBeenCalledTimes(1)
    const event = pushAccessEvent.mock.calls[0]![0]
    expect(event.path).toBe('/post/1')
    expect(event.entityType).toBe('post')
    expect(event.entityId).toBe(1n)
  })

  it('exports KOBATO_AID_COOKIE constant', () => {
    expect(KOBATO_AID_COOKIE).toBe('kobato_aid')
  })

  it('never throws on internal failure (defensive try/catch)', async () => {
    pushAccessEvent.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    await expect(trackAccess(makeFacts({ userAgent: CHROME_UA }), null)).resolves.toBeUndefined()
  })
})
