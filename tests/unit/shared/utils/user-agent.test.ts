import { describe, expect, it } from 'vitest'

import { formatUserAgentLabel, parseUserAgent } from '@/shared/utils/user-agent'

describe('client: user-agent parser', () => {
  const chromeMac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const safariIos =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const firefoxWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
  const edgeWin =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

  describe('parseUserAgent', () => {
    it('returns nulls for empty input', () => {
      expect(parseUserAgent('')).toEqual({ browser: null, os: null })
      expect(parseUserAgent(null)).toEqual({ browser: null, os: null })
      expect(parseUserAgent(undefined)).toEqual({ browser: null, os: null })
    })

    it('detects Chrome on macOS', () => {
      expect(parseUserAgent(chromeMac)).toEqual({ browser: 'Chrome 120', os: 'macOS' })
    })

    it('detects Safari on iOS', () => {
      expect(parseUserAgent(safariIos)).toEqual({ browser: 'Safari 17', os: 'iOS' })
    })

    it('detects Firefox on Windows', () => {
      expect(parseUserAgent(firefoxWin)).toEqual({ browser: 'Firefox 121', os: 'Windows' })
    })

    it('detects Edge on Windows (Edg token before Chrome)', () => {
      expect(parseUserAgent(edgeWin)).toEqual({ browser: 'Edge 120', os: 'Windows' })
    })

    it('falls back to null for unknown UA', () => {
      expect(parseUserAgent('Bot/1.0')).toEqual({ browser: null, os: null })
    })
  })

  describe('formatUserAgentLabel', () => {
    it('returns "未知设备" for empty input', () => {
      expect(formatUserAgentLabel('')).toBe('未知设备')
    })

    it('formats browser + os', () => {
      expect(formatUserAgentLabel(chromeMac)).toBe('Chrome 120 · macOS')
    })

    it('truncates very long unknown UA strings', () => {
      const long = 'A'.repeat(100)
      expect(formatUserAgentLabel(long)).toBe(`${'A'.repeat(79)}…`)
    })

    it('returns raw UA for short unknown strings', () => {
      expect(formatUserAgentLabel('Bot/1.0')).toBe('Bot/1.0')
    })
  })
})
