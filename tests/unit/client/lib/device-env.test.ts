import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildDeviceEnvBeacon, collectDynamicEnv, collectStaticEnv } from '@/client/lib/device-env'

// Pure collection against stubbed browser globals: present APIs map onto the
// wire fields, absent / non-finite ones are omitted (never sent as null).

type MediaMap = Record<string, boolean>

function matchMediaStub(map: MediaMap) {
  return (query: string) =>
    ({
      matches: map[query] === true,
      media: query,
    }) as MediaQueryList
}

interface StubOptions {
  screen?: Partial<Screen>
  innerWidth?: number
  innerHeight?: number
  devicePixelRatio?: number
  media?: MediaMap
  nav?: Record<string, unknown>
  storage?: Map<string, string>
}

function stubBrowser({ screen, innerWidth, innerHeight, devicePixelRatio, media = {}, nav = {} }: StubOptions): void {
  vi.stubGlobal('window', {
    screen,
    innerWidth,
    innerHeight,
    devicePixelRatio,
    matchMedia: matchMediaStub(media),
    sessionStorage: undefined,
  })
  vi.stubGlobal('navigator', nav)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('collectStaticEnv', () => {
  it('maps every available static API onto its field', () => {
    stubBrowser({
      screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1380, colorDepth: 30 },
      media: { '(pointer: fine)': true, '(pointer: coarse)': false, '(hover: hover)': true },
      nav: { maxTouchPoints: 5, language: 'zh-CN', hardwareConcurrency: 10, deviceMemory: 16 },
    })

    expect(collectStaticEnv()).toMatchObject({
      screenW: 2560,
      screenH: 1440,
      availW: 2560,
      availH: 1380,
      colorDepth: 30,
      touchPoints: 5,
      pointer: 'fine',
      hover: 'hover',
      locale: 'zh-CN',
      hardwareConcurrency: 10,
      deviceMemory: 16,
      // The timezone comes from Intl, so it is present whenever the runtime has it.
      timezone: expect.any(String),
    })
  })

  it('omits every missing / non-finite API instead of emitting null', () => {
    stubBrowser({
      screen: { width: Number.POSITIVE_INFINITY, colorDepth: 24 },
      media: { '(pointer: coarse)': false, '(pointer: fine)': false, '(hover: hover)': false, '(hover: none)': false },
      nav: {},
    })

    const fields = collectStaticEnv()
    expect(fields).not.toHaveProperty('screenW')
    expect(fields).not.toHaveProperty('touchPoints')
    expect(fields).not.toHaveProperty('locale')
    expect(fields).not.toHaveProperty('hardwareConcurrency')
    expect(fields).not.toHaveProperty('deviceMemory')
    expect(fields).not.toHaveProperty('pointer')
    expect(fields).not.toHaveProperty('hover')
    expect(fields.colorDepth).toBe(24)
  })

  it('returns nothing when the browser globals are absent (SSR)', () => {
    vi.stubGlobal('window', undefined)
    expect(collectStaticEnv()).toEqual({})
  })
})

describe('collectDynamicEnv', () => {
  it('maps viewport, DPR, preferences and the Network Information API', () => {
    stubBrowser({
      innerWidth: 1280,
      innerHeight: 720,
      devicePixelRatio: 2,
      media: { '(prefers-color-scheme: dark)': true, '(prefers-reduced-motion: reduce)': true },
      nav: { connection: { effectiveType: '4g', downlink: 9.5, rtt: 75, saveData: false } },
    })

    expect(collectDynamicEnv()).toEqual({
      viewportW: 1280,
      viewportH: 720,
      dpr: 2,
      colorScheme: 'dark',
      reducedMotion: true,
      netEffectiveType: '4g',
      netDownlink: 9.5,
      netRtt: 75,
      netSaveData: false,
    })
  })

  it('omits non-finite values, unknown effective types and a missing connection (Firefox/Safari)', () => {
    stubBrowser({
      innerWidth: 800,
      innerHeight: Number.NaN,
      devicePixelRatio: Number.NaN,
      nav: { connection: { effectiveType: '5g' } },
    })

    expect(collectDynamicEnv()).toEqual({ viewportW: 800, reducedMotion: false })

    stubBrowser({ innerWidth: 800, nav: {} })
    expect(collectDynamicEnv()).toEqual({ viewportW: 800, reducedMotion: false })
  })

  it('reads the light color-scheme and negative reduced-motion answers', () => {
    stubBrowser({
      innerWidth: 1024,
      media: { '(prefers-color-scheme: light)': true, '(prefers-reduced-motion: reduce)': false },
    })

    expect(collectDynamicEnv()).toMatchObject({ colorScheme: 'light', reducedMotion: false })
  })
})

describe('buildDeviceEnvBeacon', () => {
  it('includes the static block only on the session-first beacon', () => {
    stubBrowser({ screen: { width: 1920, height: 1080 }, innerWidth: 960, media: {} })

    const first = buildDeviceEnvBeacon('00000000-0000-4000-8000-000000000001', true)
    expect(first).toMatchObject({ hasStatic: true, screenW: 1920, viewportW: 960 })

    const later = buildDeviceEnvBeacon('00000000-0000-4000-8000-000000000002', false)
    expect(later.hasStatic).toBe(false)
    expect(later).not.toHaveProperty('screenW')
    expect(later).toMatchObject({ viewportW: 960 })
  })
})
