import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'
import type { RequestFacts } from '@/server/infra/http/request-facts'

// Spy-level complement to the integration suite
// (tests/it/server/domains/analytics/track.test.ts): that suite pins WHAT
// lands in the engine, this one pins that a dropped bot never pays for
// enrichment — the GeoIP lookup + salted IP hash live behind enrichEvent.
const enrichMock = vi.hoisted(() => ({
  enrichEvent: vi.fn<(raw: RawAccessEvent) => Promise<EnrichedAccessEvent>>(),
}))
const batcherMock = vi.hoisted(() => ({ pushAccessEvent: vi.fn() }))
const pvMock = vi.hoisted(() => ({ bumpPageView: vi.fn() }))
const settings = vi.hoisted(() => ({ keepBotRows: false }))

vi.mock('@/server/domains/analytics/enrich', () => enrichMock)
vi.mock('@/server/domains/analytics/services/batcher', () => batcherMock)
vi.mock('@/server/domains/analytics/services/pv-batcher', () => pvMock)
vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: () => ({
    analytics: { analytics: { trackAdmin: false, keepBotRows: settings.keepBotRows } },
  }),
}))

const { trackPageView } = await import('@/server/domains/analytics/track')

const POST_TARGET = { type: 'post' as const, ownerId: 1 }
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

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

beforeEach(() => {
  vi.clearAllMocks()
  settings.keepBotRows = false
  enrichMock.enrichEvent.mockImplementation(async (raw) => ({ ...raw }) as unknown as EnrichedAccessEvent)
})

describe('analytics/track — bot enrichment gate', () => {
  it('drops a bot before enrichment — no GeoIP / hashIp, no access event, counter still bumps', async () => {
    await trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)

    expect(pvMock.bumpPageView).toHaveBeenCalledWith(POST_TARGET)
    expect(enrichMock.enrichEvent).not.toHaveBeenCalled()
    expect(batcherMock.pushAccessEvent).not.toHaveBeenCalled()
  })

  it('enriches and stores a bot row when keepBotRows is on', async () => {
    settings.keepBotRows = true

    await trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)

    expect(enrichMock.enrichEvent).toHaveBeenCalledOnce()
    expect(batcherMock.pushAccessEvent).toHaveBeenCalledOnce()
  })

  it('enriches and stores a normal visit', async () => {
    await trackPageView(makeFacts({ userAgent: CHROME_UA }), POST_TARGET)

    expect(pvMock.bumpPageView).toHaveBeenCalledWith(POST_TARGET)
    expect(enrichMock.enrichEvent).toHaveBeenCalledOnce()
    expect(batcherMock.pushAccessEvent).toHaveBeenCalledOnce()
  })
})
