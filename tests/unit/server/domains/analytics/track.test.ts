import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DeviceEnvServerRow } from '@/server/domains/analytics/services/device-env'
import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'
import type { RequestFacts } from '@/server/infra/http/request-facts'

// Spy-level complement to tests/it/server/domains/analytics/track.test.ts: that suite
// pins what lands in the engine, this one pins that a dropped bot never pays for
// enrichment — the GeoIP lookup + salted IP hash live behind enrichEvent.
const enrichMock = vi.hoisted(() => ({
  enrichEvent: vi.fn<(raw: RawAccessEvent) => Promise<EnrichedAccessEvent>>(),
  buildDeviceEnvServerRow: vi.fn<(raw: RawAccessEvent) => DeviceEnvServerRow>(),
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

const { flushTrackedEvents, trackPageView } = await import('@/server/domains/analytics/track')

const EVENT_ID = '00000000-0000-4000-8000-0000000000cd'
const POST_TARGET = { type: 'post' as const, ownerId: 1 }
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

function makeFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    analyticsEventId: EVENT_ID,
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

beforeEach(() => {
  vi.clearAllMocks()
  settings.keepBotRows = false
  enrichMock.enrichEvent.mockImplementation(async (raw) => ({ ...raw }) as unknown as EnrichedAccessEvent)
  enrichMock.buildDeviceEnvServerRow.mockReturnValue({
    eventId: EVENT_ID,
    timestamp: new Date(),
  } as DeviceEnvServerRow)
})

describe('analytics/track — synchronous gates, async tail', () => {
  it('drops a bot before enrichment — no GeoIP / hashIp, no access event, counter still bumps', async () => {
    expect(trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)).toBeNull()
    await flushTrackedEvents()

    expect(pvMock.bumpPageView).toHaveBeenCalledWith(POST_TARGET)
    expect(enrichMock.enrichEvent).not.toHaveBeenCalled()
    expect(batcherMock.pushAccessEvent).not.toHaveBeenCalled()
  })

  it('enriches and stores a bot row when keepBotRows is on', async () => {
    settings.keepBotRows = true

    expect(trackPageView(makeFacts({ userAgent: BOT_UA }), POST_TARGET)).toBe(EVENT_ID)
    await flushTrackedEvents()

    expect(enrichMock.enrichEvent).toHaveBeenCalledOnce()
    expect(batcherMock.pushAccessEvent).toHaveBeenCalledOnce()
  })

  it('enriches and stores a normal visit as an event + sidecar pair', async () => {
    expect(trackPageView(makeFacts({ userAgent: CHROME_UA }), POST_TARGET)).toBe(EVENT_ID)
    await flushTrackedEvents()

    expect(pvMock.bumpPageView).toHaveBeenCalledWith(POST_TARGET)
    expect(enrichMock.enrichEvent).toHaveBeenCalledOnce()
    const item = batcherMock.pushAccessEvent.mock.calls[0]![0]
    expect(item.event.eventId).toBe(EVENT_ID)
    expect(item.envServer).toBe(enrichMock.buildDeviceEnvServerRow.mock.results[0]!.value)
  })

  it('returns null for admin and prefetch visits without touching either signal', async () => {
    expect(trackPageView(makeFacts(), POST_TARGET, { isAdmin: true })).toBeNull()
    expect(trackPageView(makeFacts({ purpose: 'prefetch' }), POST_TARGET)).toBeNull()
    await flushTrackedEvents()

    expect(pvMock.bumpPageView).not.toHaveBeenCalled()
    expect(enrichMock.enrichEvent).not.toHaveBeenCalled()
  })

  it('honours the eventId override (tests) but defaults to the request id', async () => {
    const override = '00000000-0000-4000-8000-0000000000ee'
    expect(trackPageView(makeFacts({ userAgent: CHROME_UA }), null, { eventId: override })).toBe(override)
    expect(trackPageView(makeFacts({ userAgent: CHROME_UA }), null)).toBe(EVENT_ID)
    await flushTrackedEvents()

    expect(enrichMock.enrichEvent).toHaveBeenCalledTimes(2)
    expect(batcherMock.pushAccessEvent.mock.calls[0]![0].event.eventId).toBe(override)
    expect(batcherMock.pushAccessEvent.mock.calls[1]![0].event.eventId).toBe(EVENT_ID)
  })
})
