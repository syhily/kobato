import { computeDateRange, pickTimeUnit } from '@kobato/base/utils/date-range'
import { describe, expect, it } from 'vitest'

const HOUR = 60 * 60
const DAY = 24 * HOUR

describe('computeDateRange', () => {
  const now = new Date('2026-11-18T15:42:11Z')
  const nowSec = Math.floor(now.getTime() / 1000)

  it.each([
    ['last-1h', HOUR],
    ['last-7d', 7 * DAY],
    ['last-30d', 30 * DAY],
    ['last-90d', 90 * DAY],
    ['last-365d', 365 * DAY],
  ] as const)('computes %s relative to now', (preset, span) => {
    expect(computeDateRange(preset, now)).toEqual({ startAt: nowSec - span, endAt: nowSec })
  })

  it('uses local-day boundaries for today and yesterday', () => {
    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)
    const startAt = Math.floor(startOfToday.getTime() / 1000)

    expect(computeDateRange('today', now)).toEqual({ startAt, endAt: nowSec })
    expect(computeDateRange('yesterday', now)).toEqual({ startAt: startAt - DAY, endAt: startAt })
  })
})

describe('pickTimeUnit', () => {
  it('picks minute for ranges up to one hour', () => {
    expect(pickTimeUnit({ startAt: 0, endAt: 30 * 60 })).toBe('minute')
    expect(pickTimeUnit({ startAt: 0, endAt: HOUR })).toBe('minute')
  })

  it('picks hour for ranges between one hour and one day', () => {
    expect(pickTimeUnit({ startAt: 0, endAt: HOUR + 1 })).toBe('hour')
    expect(pickTimeUnit({ startAt: 0, endAt: DAY })).toBe('hour')
  })

  it('picks day for ranges over one day', () => {
    expect(pickTimeUnit({ startAt: 0, endAt: DAY + 1 })).toBe('day')
    expect(pickTimeUnit({ startAt: 0, endAt: 365 * DAY })).toBe('day')
  })
})
