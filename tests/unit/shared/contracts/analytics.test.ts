import { describe, expect, it } from 'vitest'

import { pickAggregateSource } from '@/shared/contracts/analytics'

const HOUR = 60 * 60
const DAY = 24 * HOUR

describe('pickAggregateSource', () => {
  it('uses raw access_log for ranges ≤ 24 hours', () => {
    expect(pickAggregateSource({ startAt: 0, endAt: HOUR })).toBe('access_log')
    expect(pickAggregateSource({ startAt: 0, endAt: DAY })).toBe('access_log')
  })

  it('uses stats_hourly for ranges between 24 hours and 30 days', () => {
    expect(pickAggregateSource({ startAt: 0, endAt: DAY + 1 })).toBe('stats_hourly')
    expect(pickAggregateSource({ startAt: 0, endAt: 7 * DAY })).toBe('stats_hourly')
    expect(pickAggregateSource({ startAt: 0, endAt: 30 * DAY })).toBe('stats_hourly')
  })

  it('uses stats_daily for ranges > 30 days', () => {
    expect(pickAggregateSource({ startAt: 0, endAt: 30 * DAY + 1 })).toBe('stats_daily')
    expect(pickAggregateSource({ startAt: 0, endAt: 365 * DAY })).toBe('stats_daily')
  })
})
