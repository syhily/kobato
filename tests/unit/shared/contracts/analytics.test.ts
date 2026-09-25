import { describe, expect, it } from 'vitest'

import { analyticsQuerySchema, pickTimeUnit } from '@/shared/contracts/analytics'

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
