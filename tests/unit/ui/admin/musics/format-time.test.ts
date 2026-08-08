import { describe, expect, it } from 'vitest'

import { formatTime } from '@/ui/admin/musics/format-time'

describe('formatTime', () => {
  it('returns 0:00 for NaN input', () => {
    expect(formatTime(Number.NaN)).toBe('0:00')
  })

  it('returns 0:00 for Infinity input', () => {
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00')
  })

  it('returns 0:00 for negative input', () => {
    expect(formatTime(-5)).toBe('0:00')
    expect(formatTime(-0.1)).toBe('0:00')
  })

  it('returns 0:00 for exactly zero', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('zero-pads single-digit seconds', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(9)).toBe('0:09')
  })

  it('does not pad double-digit seconds', () => {
    expect(formatTime(10)).toBe('0:10')
    expect(formatTime(59)).toBe('0:59')
  })

  it('accumulates whole minutes and resets the seconds counter', () => {
    expect(formatTime(60)).toBe('1:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(119)).toBe('1:59')
  })

  it('handles multi-minute durations', () => {
    expect(formatTime(125)).toBe('2:05')
    expect(formatTime(600)).toBe('10:00')
    expect(formatTime(3661)).toBe('61:01')
  })

  it('truncates fractional seconds (floor)', () => {
    expect(formatTime(5.9)).toBe('0:05')
    expect(formatTime(65.999)).toBe('1:05')
  })
})
