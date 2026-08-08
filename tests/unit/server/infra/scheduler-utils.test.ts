import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DomainError } from '@/server/infra/http/errors'
import { MAX_TIMER_DELAY_MS, computeNextRun, scheduleJob, stopAllScheduledJobs } from '@/server/infra/scheduler-utils'

describe('infra/scheduler-utils — computeNextRun', () => {
  const timeZone = 'Asia/Shanghai'

  it('computes next daily run when target is later today', () => {
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'daily', hour: 14, minute: 30 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-15T14:30:00.000+08:00')
  })

  it('computes next daily run when target has passed today', () => {
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
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun({ frequency: 'monthly', hour: 14, minute: 0, dayOfMonth: 15 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-01-15T14:00:00.000+08:00')
  })

  it('computes next monthly run on same day when time has passed', () => {
    const now = new Date('2024-01-15T16:00:00+08:00')
    const next = computeNextRun({ frequency: 'monthly', hour: 14, minute: 0, dayOfMonth: 15 }, timeZone, now)
    expect(next.toISOString()).toBe('2024-02-15T14:00:00.000+08:00')
  })

  it('computes next monthly run for a different day in the same month', () => {
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

  it('throws when weekly schedule lacks dayOfWeek', () => {
    const now = new Date('2024-01-15T10:00:00+08:00')
    expect(() => computeNextRun({ frequency: 'weekly', hour: 3, minute: 0 }, timeZone, now)).toThrow(DomainError)
  })

  it('throws when weekly dayOfWeek is out of range', () => {
    const now = new Date('2024-01-15T10:00:00+08:00')
    expect(() => computeNextRun({ frequency: 'weekly', hour: 3, minute: 0, dayOfWeek: 0 }, timeZone, now)).toThrow(
      DomainError,
    )
    expect(() => computeNextRun({ frequency: 'weekly', hour: 3, minute: 0, dayOfWeek: 8 }, timeZone, now)).toThrow(
      DomainError,
    )
  })

  it('throws when monthly schedule lacks dayOfMonth', () => {
    const now = new Date('2024-01-15T10:00:00+08:00')
    expect(() => computeNextRun({ frequency: 'monthly', hour: 3, minute: 0 }, timeZone, now)).toThrow(DomainError)
  })

  it('throws when monthly dayOfMonth is out of range', () => {
    const now = new Date('2024-01-15T10:00:00+08:00')
    expect(() => computeNextRun({ frequency: 'monthly', hour: 3, minute: 0, dayOfMonth: 0 }, timeZone, now)).toThrow(
      DomainError,
    )
    expect(() => computeNextRun({ frequency: 'monthly', hour: 3, minute: 0, dayOfMonth: 32 }, timeZone, now)).toThrow(
      DomainError,
    )
  })

  it('ignores day fields for daily schedule', () => {
    const now = new Date('2024-01-15T10:00:00+08:00')
    const next = computeNextRun(
      { frequency: 'daily', hour: 14, minute: 30, dayOfWeek: 99, dayOfMonth: 99 },
      timeZone,
      now,
    )
    expect(next.toISOString()).toBe('2024-01-15T14:30:00.000+08:00')
  })
})

describe('infra/scheduler-utils — scheduleJob long-delay chunking', () => {
  // Node clamps setTimeout delays ≥ 2^31-1 ms to 1 ms, so long delays must
  // never reach a single setTimeout call.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopAllScheduledJobs()
    vi.useRealTimers()
  })

  it('arms a capped re-evaluation timer instead of the raw delay', () => {
    const run = vi.fn()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    scheduleJob({ name: 'test-long-delay', nextDelayMs: () => THIRTY_DAYS_MS, run })

    const rawDelays = setTimeoutSpy.mock.calls.map((call) => call[1])
    expect(rawDelays).not.toContain(THIRTY_DAYS_MS)
    expect(rawDelays).toContain(MAX_TIMER_DELAY_MS)
    setTimeoutSpy.mockRestore()
  })

  it('never runs the job while the delay still exceeds the cap', () => {
    const run = vi.fn()
    scheduleJob({ name: 'test-no-early-run', nextDelayMs: () => THIRTY_DAYS_MS, run })

    vi.advanceTimersByTime(3 * MAX_TIMER_DELAY_MS)
    expect(run).not.toHaveBeenCalled()
  })

  it('runs once the recomputed delay fits under the cap', () => {
    const run = vi.fn()
    const nextDelayMs = vi.fn().mockReturnValueOnce(THIRTY_DAYS_MS).mockReturnValue(60_000)
    scheduleJob({ name: 'test-chunked-converge', nextDelayMs, run })

    vi.advanceTimersByTime(MAX_TIMER_DELAY_MS)
    expect(run).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60_000)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
