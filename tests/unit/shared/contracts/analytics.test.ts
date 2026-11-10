import { describe, expect, it } from 'vitest'

import {
  METRIC_GROUP_TABS,
  METRIC_TYPES,
  analyticsQuerySchema,
  deviceEnvBeaconSchema,
  pickTimeUnit,
} from '@/shared/contracts/analytics'

const HOUR = 60 * 60
const DAY = 24 * HOUR

describe('pickTimeUnit', () => {
  it('picks minute for ranges ≤ 1 hour', () => {
    expect(pickTimeUnit({ startAt: 0, endAt: 30 * 60 })).toBe('minute')
    expect(pickTimeUnit({ startAt: 0, endAt: HOUR })).toBe('minute')
  })

  it('picks hour for ranges between 1 hour and 1 day', () => {
    expect(pickTimeUnit({ startAt: 0, endAt: HOUR + 1 })).toBe('hour')
    expect(pickTimeUnit({ startAt: 0, endAt: DAY })).toBe('hour')
  })

  it('picks day for ranges > 1 day', () => {
    expect(pickTimeUnit({ startAt: 0, endAt: DAY + 1 })).toBe('day')
    expect(pickTimeUnit({ startAt: 0, endAt: 365 * DAY })).toBe('day')
  })
})

describe('analyticsQuerySchema dimension filters', () => {
  // The single control-character gate — every controller input and every
  // parseAnalyticsSearch call passes this refine before reaching SQL.
  it.each(['safe\nunsafe', 'safe\u007Funsafe'])('rejects control characters in %j', (value) => {
    expect(analyticsQuerySchema.safeParse({ path: value }).success).toBe(false)
    expect(analyticsQuerySchema.safeParse({ country: value }).success).toBe(false)
  })
})

describe('analyticsQuerySchema includeUnknown', () => {
  it('parses string and boolean forms, defaulting to absent', () => {
    expect(analyticsQuerySchema.parse({ includeUnknown: 'true' }).includeUnknown).toBe(true)
    expect(analyticsQuerySchema.parse({ includeUnknown: 'false' }).includeUnknown).toBe(false)
    expect(analyticsQuerySchema.parse({ includeUnknown: true }).includeUnknown).toBe(true)
    expect(analyticsQuerySchema.parse({}).includeUnknown).toBeUndefined()
  })

  it('rejects non-boolean strings', () => {
    expect(analyticsQuerySchema.safeParse({ includeUnknown: 'yes' }).success).toBe(false)
  })
})

describe('deviceEnvBeaconSchema', () => {
  const EVENT_ID = '00000000-0000-4000-8000-000000000001'

  it('accepts a dynamic-only beacon (dpr rides every beacon)', () => {
    expect(deviceEnvBeaconSchema.parse({ eventId: EVENT_ID, hasStatic: false, dpr: 2 })).toEqual({
      eventId: EVENT_ID,
      hasStatic: false,
      dpr: 2,
    })
  })

  it('accepts the full static + dynamic payload', () => {
    const payload = {
      eventId: EVENT_ID,
      hasStatic: true,
      screenW: 2560,
      screenH: 1440,
      availW: 2560,
      availH: 1380,
      dpr: 2,
      colorDepth: 30,
      touchPoints: 5,
      pointer: 'fine',
      hover: 'hover',
      locale: 'zh-CN',
      timezone: 'Asia/Shanghai',
      hardwareConcurrency: 10,
      deviceMemory: 16,
      viewportW: 1280,
      viewportH: 720,
      colorScheme: 'dark',
      reducedMotion: true,
      netEffectiveType: '4g',
      netDownlink: 9.5,
      netRtt: 75,
      netSaveData: false,
    }
    expect(deviceEnvBeaconSchema.parse(payload)).toEqual(payload)
  })

  it('rejects a non-uuid event id and degenerate dimensions', () => {
    expect(deviceEnvBeaconSchema.safeParse({ eventId: 'not-a-uuid', hasStatic: false }).success).toBe(false)
    expect(deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: false, screenW: 100.5 }).success).toBe(false)
    expect(deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: false, dpr: '2' }).success).toBe(false)
  })

  it.each([
    ['screenW', 32769],
    ['screenW', -1],
    ['viewportH', -1],
    ['dpr', 10.1],
    ['colorDepth', 65],
    ['touchPoints', 65],
    ['netRtt', 60001],
    ['netRtt', -1],
    ['netDownlink', 10001],
    ['hardwareConcurrency', 1025],
    ['deviceMemory', 1025],
  ])('rejects out-of-range %s=%s', (key, value) => {
    expect(deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: false, [key]: value }).success).toBe(false)
  })

  it.each([
    ['pointer', 'none'],
    ['pointer', 'any'],
    ['hover', 'fine'],
    ['colorScheme', 'auto'],
    ['netEffectiveType', '5g'],
  ])('rejects bad enum %s=%s', (key, value) => {
    expect(deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: false, [key]: value }).success).toBe(false)
  })

  it('bounds the locale and timezone strings', () => {
    expect(
      deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: true, locale: 'x'.repeat(64) }).success,
    ).toBe(true)
    expect(
      deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: true, locale: 'x'.repeat(65) }).success,
    ).toBe(false)
    expect(
      deviceEnvBeaconSchema.safeParse({ eventId: EVENT_ID, hasStatic: true, timezone: 'x'.repeat(65) }).success,
    ).toBe(false)
  })
})

describe('analytics metric dimensions contract', () => {
  const BLOB_METRICS = [
    'country',
    'region',
    'city',
    'referer',
    'language',
    'timezone',
    'os',
    'browser',
    'browserType',
    'device',
    'deviceType',
  ]
  const ENV_METRICS = ['screen', 'viewport', 'dpr', 'touch', 'colorScheme', 'netEffectiveType']

  it('pins the metric type inventory (blob slots + device-environment dims)', () => {
    expect([...METRIC_TYPES]).toEqual([...BLOB_METRICS, ...ENV_METRICS, 'path'])
  })

  it('pins the device group tabs', () => {
    expect(METRIC_GROUP_TABS.device).toEqual(['device', 'deviceType', ...ENV_METRICS])
  })

  it('accepts environment dimension filters in the shared query schema', () => {
    const parsed = analyticsQuerySchema.parse({
      screen: '1920×1080',
      viewport: '≤768',
      dpr: '2x',
      touch: '1–5 点',
      colorScheme: 'dark,light',
      netEffectiveType: '4g',
    })
    expect(parsed.screen).toBe('1920×1080')
    expect(parsed.viewport).toBe('≤768')
    expect(parsed.dpr).toBe('2x')
    expect(parsed.touch).toBe('1–5 点')
    expect(parsed.colorScheme).toBe('dark,light')
    expect(parsed.netEffectiveType).toBe('4g')
  })

  it('rejects control characters in an environment filter', () => {
    expect(analyticsQuerySchema.safeParse({ viewport: '≤768\n' }).success).toBe(false)
  })
})
