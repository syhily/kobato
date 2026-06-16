import { describe, expect, it } from 'vitest'

import { formatUserAgentLabel } from '@/shared/utils/user-agent'

describe('shared/utils/user-agent — formatUserAgentLabel', () => {
  it('returns the unknown-device label for empty input', () => {
    expect(formatUserAgentLabel(null)).toBe('未知设备')
    expect(formatUserAgentLabel(undefined)).toBe('未知设备')
    expect(formatUserAgentLabel('')).toBe('未知设备')
  })

  it('combines browser and os when both parse', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    const label = formatUserAgentLabel(ua)
    expect(label).toContain('Chrome')
    expect(label).toMatch(/mac/i)
  })

  it('trims the browser version to the major segment', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.5.0.193 Safari/537.36'
    expect(formatUserAgentLabel(ua)).toMatch(/Chrome 121/)
  })

  it('returns just the os when the browser fails to parse', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    const label = formatUserAgentLabel(ua)
    expect(label).toContain('iOS')
  })

  it('prefers the UA-CH platform hint over the parsed UA os', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    const label = formatUserAgentLabel(ua, 'iOS')
    expect(label).toContain('iOS')
    expect(label).not.toContain('macOS')
  })

  it('truncates an unparseable UA to the cap and appends ellipsis', () => {
    const long = 'x'.repeat(120)
    const label = formatUserAgentLabel(long)
    expect(label.length).toBe(80)
    expect(label.endsWith('…')).toBe(true)
  })

  it('returns the raw UA when it is short and unparseable', () => {
    expect(formatUserAgentLabel('curl/8.0')).toBe('curl/8.0')
  })
})
