import { describe, expect, it } from 'vitest'

import { pickTimeBucketMs } from '@/shared/contracts/analytics'

const HOUR = 60 * 60
const DAY = 24 * HOUR

describe('pickTimeBucketMs', () => {
  it('picks 1 minute for ranges ≤ 2 hours', () => {
    expect(pickTimeBucketMs({ startAt: 0, endAt: HOUR })).toBe(60_000)
    expect(pickTimeBucketMs({ startAt: 0, endAt: 2 * HOUR })).toBe(60_000)
  })

  it('picks 15 minutes for ranges between 2 and 12 hours', () => {
    expect(pickTimeBucketMs({ startAt: 0, endAt: 2 * HOUR + 1 })).toBe(15 * 60_000)
    expect(pickTimeBucketMs({ startAt: 0, endAt: 12 * HOUR })).toBe(15 * 60_000)
  })

  it('picks 1 hour for ranges between 12 hours and 30 days', () => {
    expect(pickTimeBucketMs({ startAt: 0, endAt: 12 * HOUR + 1 })).toBe(3_600_000)
    expect(pickTimeBucketMs({ startAt: 0, endAt: 30 * DAY })).toBe(3_600_000)
  })

  it('picks 1 day for ranges > 30 days', () => {
    expect(pickTimeBucketMs({ startAt: 0, endAt: 30 * DAY + 1 })).toBe(86_400_000)
    expect(pickTimeBucketMs({ startAt: 0, endAt: 365 * DAY })).toBe(86_400_000)
  })
})
