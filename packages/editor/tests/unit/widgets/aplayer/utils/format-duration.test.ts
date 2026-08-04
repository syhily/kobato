import { formatAudioDuration } from '@kobato/editor/widgets/aplayer/utils/format-duration'
import { describe, expect, it } from 'vitest'

describe('editor/widgets/aplayer/utils/format-duration', () => {
  it('returns --:-- for undefined', () => {
    expect(formatAudioDuration(undefined)).toBe('--:--')
  })

  it('returns 00:00 for NaN', () => {
    expect(formatAudioDuration(Number.NaN)).toBe('00:00')
  })

  it('formats zero seconds', () => {
    expect(formatAudioDuration(0)).toBe('00:00')
  })

  it('formats seconds under one minute', () => {
    expect(formatAudioDuration(5)).toBe('00:05')
    expect(formatAudioDuration(45)).toBe('00:45')
  })

  it('formats minutes and seconds', () => {
    expect(formatAudioDuration(60)).toBe('01:00')
    expect(formatAudioDuration(75)).toBe('01:15')
    expect(formatAudioDuration(3599)).toBe('59:59')
  })

  it('formats hours when >= 3600s', () => {
    expect(formatAudioDuration(3600)).toBe('01:00:00')
    expect(formatAudioDuration(3661)).toBe('01:01:01')
    expect(formatAudioDuration(7200)).toBe('02:00:00')
    expect(formatAudioDuration(7323)).toBe('02:02:03')
  })

  it('truncates fractional seconds', () => {
    expect(formatAudioDuration(65.9)).toBe('01:05')
    expect(formatAudioDuration(65.1)).toBe('01:05')
  })
})
