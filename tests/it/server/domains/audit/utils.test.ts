import { describe, expect, it } from 'vitest'

import { maskIp, maskUserAgent } from '@/server/domains/audit/utils'

describe('audit/utils', () => {
  describe('maskIp', () => {
    it('masks IPv4 addresses', () => {
      expect(maskIp('192.168.1.42')).toBe('192.168.x.x')
      expect(maskIp('10.0.0.1')).toBe('10.0.x.x')
    })

    it('masks IPv6 addresses', () => {
      expect(maskIp('2001:db8::1')).toBe('2001:db8:1:x:x')
    })

    it('masks IPv4-mapped IPv6 addresses', () => {
      expect(maskIp('::ffff:192.168.1.42')).toBe('192.168.x.x')
      expect(maskIp('::FFFF:10.0.0.1')).toBe('10.0.x.x')
    })

    it('returns empty string for null/undefined', () => {
      expect(maskIp(null)).toBe('')
      expect(maskIp(undefined)).toBe('')
    })

    it('returns original for unexpected formats', () => {
      expect(maskIp('not-an-ip')).toBe('not-an-ip')
    })
  })

  describe('maskUserAgent', () => {
    it('extracts browser and OS family', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36'
      expect(maskUserAgent(ua)).toBe('Chrome / Windows NT 10.0')
    })

    it('falls back to truncation for unknown UAs', () => {
      const ua = 'SomeWeirdBot/1.0 (CustomPlatform; ARM) VeryLongStringThatExceedsFortyCharacters'
      expect(maskUserAgent(ua)).toBe(`${ua.slice(0, 40)}…`)
    })

    it('returns empty string for null/undefined', () => {
      expect(maskUserAgent(null)).toBe('')
      expect(maskUserAgent(undefined)).toBe('')
    })
  })
})
