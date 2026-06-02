import { describe, expect, it } from 'vitest'

import { computeNextRun } from '@/server/domains/backup/scheduler-utils'

describe('services/backup — scheduler', () => {
  const timeZone = 'Asia/Shanghai'

  it('computes next daily run when target is later today', () => {
    // 2024-01-15 10:00 CST
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'daily', hour: 14, minute: 30 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-15T14:30:00.000+08:00')
  })

  it('computes next daily run when target has passed today', () => {
    // 2024-01-15 16:00 CST
    const now = new Date('2024-01-15T16:00:00+08:00')
    const next = computeNextRun({ frequency: 'daily', hour: 14, minute: 30 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-16T14:30:00.000+08:00')
  })

  it('computes next weekly run on same day when time has not passed', () => {
    // Monday 2024-01-15 10:00 CST
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'weekly', hour: 14, minute: 0, dayOfWeek: 1 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-15T14:00:00.000+08:00')
  })

  it('computes next weekly run on same day when time has passed', () => {
    // Monday 2024-01-15 16:00 CST
    const now = new Date('2024-01-15T16:00:00+08:00')
    const next = computeNextRun({ frequency: 'weekly', hour: 14, minute: 0, dayOfWeek: 1 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-22T14:00:00.000+08:00')
  })

  it('computes next weekly run for a different day', () => {
    // Monday 2024-01-15 10:00 CST, target is Wednesday
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'weekly', hour: 3, minute: 0, dayOfWeek: 3 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-17T03:00:00.000+08:00')
  })

  it('computes next monthly run on same day when time has not passed', () => {
    // 2024-01-15 10:00 CST
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'monthly', hour: 14, minute: 0, dayOfMonth: 15 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-15T14:00:00.000+08:00')
  })

  it('computes next monthly run on same day when time has passed', () => {
    // 2024-01-15 16:00 CST
    const now = new Date('2024-01-15T16:00:00+08:00')
    const next = computeNextRun({ frequency: 'monthly', hour: 14, minute: 0, dayOfMonth: 15 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-02-15T14:00:00.000+08:00')
  })

  it('computes next monthly run for a different day in the same month', () => {
    // 2024-01-10 10:00 CST, target is the 20th
    const now = new Date('2024-01-10T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'monthly', hour: 3, minute: 30, dayOfMonth: 20 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-20T03:30:00.000+08:00')
  })

  it('handles Sunday as dayOfWeek 7', () => {
    // Monday 2024-01-15 10:00 CST, target is Sunday
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'weekly', hour: 3, minute: 0, dayOfWeek: 7 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-21T03:00:00.000+08:00')
  })
})
