import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import {
  __resetDeviceEnvBeaconForTests,
  extractAnalyticsEventId,
  sendDeviceEnvBeacon,
  useDeviceEnvBeacon,
} from '@/client/hooks/use-device-env-beacon'

// The collector's behaviour gates: deepest `eid`, DNT opt-out, sendBeacon
// availability, and the session-once static block.

const EVENT_ID = '00000000-0000-4000-8000-0000000000e1'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    },
  }
}

function stubCollectorEnv(
  options: {
    doNotTrack?: string
    sendBeacon?: ((url: string, data: BodyInit | null) => boolean) | undefined
  } = {},
) {
  const storage = memoryStorage()
  vi.stubGlobal('window', {
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
    innerWidth: 960,
    innerHeight: 540,
    devicePixelRatio: 1,
    matchMedia: (query: string) => ({ matches: query === '(pointer: fine)', media: query }),
    sessionStorage: storage,
  })
  vi.stubGlobal('navigator', {
    doNotTrack: options.doNotTrack ?? null,
    sendBeacon: options.sendBeacon,
    maxTouchPoints: 0,
    language: 'en-US',
    hardwareConcurrency: 8,
  })
  return { storage }
}

type SendBeaconMock = ReturnType<typeof vi.fn<(url: string, data: BodyInit | null) => boolean>>

async function sentPayload(sendBeacon: SendBeaconMock, callIndex = 0): Promise<Record<string, unknown>> {
  const body = sendBeacon.mock.calls[callIndex]![1] as Blob
  return JSON.parse(await body.text()) as Record<string, unknown>
}

beforeEach(() => {
  __resetDeviceEnvBeaconForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractAnalyticsEventId', () => {
  it('reads the deepest match that published an eid', () => {
    const matches = [
      { loaderData: { boot: true } },
      { loaderData: { eid: '00000000-0000-4000-8000-0000000000a1' } },
      { loaderData: { eid: EVENT_ID, pageNum: 1 } },
    ]
    expect(extractAnalyticsEventId(matches)).toBe(EVENT_ID)
  })

  it('ignores matches without a usable eid', () => {
    expect(
      extractAnalyticsEventId([
        { loaderData: null },
        { loaderData: { eid: '' } },
        { loaderData: { eid: 42 } },
        {},
        { loaderData: { other: true } },
      ]),
    ).toBeNull()
    expect(extractAnalyticsEventId([])).toBeNull()
  })
})

describe('sendDeviceEnvBeacon', () => {
  it('is fully silenced by DNT', async () => {
    const sendBeacon = vi.fn<(url: string, data: BodyInit | null) => boolean>(() => true)
    const { storage } = stubCollectorEnv({ doNotTrack: '1', sendBeacon })

    expect(sendDeviceEnvBeacon(EVENT_ID)).toBe(false)
    expect(sendBeacon).not.toHaveBeenCalled()
    expect(storage.getItem('kobato.env.static')).toBeNull()
  })

  it('skips when sendBeacon is unavailable (no fetch fallback)', () => {
    stubCollectorEnv({ sendBeacon: undefined })
    expect(sendDeviceEnvBeacon(EVENT_ID)).toBe(false)
  })

  it('sends the static block once per session, then dynamic-only beacons', async () => {
    const sendBeacon = vi.fn<(url: string, data: BodyInit | null) => boolean>(() => true)
    const { storage } = stubCollectorEnv({ sendBeacon })

    expect(sendDeviceEnvBeacon(EVENT_ID)).toBe(true)
    expect(sendBeacon.mock.calls[0]![0]).toBe('/api/analytics/env')
    const first = await sentPayload(sendBeacon)
    expect(first).toMatchObject({
      eventId: EVENT_ID,
      hasStatic: true,
      screenW: 1920,
      viewportW: 960,
      pointer: 'fine',
      locale: 'en-US',
    })
    expect(storage.getItem('kobato.env.static')).toBe('1')

    expect(sendDeviceEnvBeacon('00000000-0000-4000-8000-0000000000e2')).toBe(true)
    const second = await sentPayload(sendBeacon, 1)
    expect(second).toMatchObject({
      eventId: '00000000-0000-4000-8000-0000000000e2',
      hasStatic: false,
      viewportW: 960,
    })
    expect(second).not.toHaveProperty('screenW')
  })

  it('sends each event id at most once (navigation replay / StrictMode double effect)', () => {
    const sendBeacon = vi.fn<(url: string, data: BodyInit | null) => boolean>(() => true)
    stubCollectorEnv({ sendBeacon })

    expect(sendDeviceEnvBeacon(EVENT_ID)).toBe(true)
    expect(sendDeviceEnvBeacon(EVENT_ID)).toBe(false)

    expect(sendBeacon).toHaveBeenCalledOnce()
  })

  it('leaves the session marker unset when the browser refuses the beacon', () => {
    const sendBeacon = vi.fn<(url: string, data: BodyInit | null) => boolean>(() => false)
    const { storage } = stubCollectorEnv({ sendBeacon })

    expect(sendDeviceEnvBeacon(EVENT_ID)).toBe(false)
    expect(storage.getItem('kobato.env.static')).toBeNull()
  })
})

describe('useDeviceEnvBeacon', () => {
  it('renders without error in SSR', () => {
    expect(() => renderHook(() => useDeviceEnvBeacon())).not.toThrow()
  })
})
