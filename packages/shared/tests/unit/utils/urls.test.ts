import { joinUrl, withLeadingSlash } from '@kobato/shared/utils/urls'
import { describe, expect, it } from 'vitest'

describe('client: url utilities', () => {
  describe('joinUrl', () => {
    it('joins two path segments', () => {
      expect(joinUrl('foo', 'bar')).toBe('foo/bar')
    })

    it('trims extra leading slashes from subsequent parts', () => {
      expect(joinUrl('foo', '/bar')).toBe('foo/bar')
    })

    it('trims extra trailing slashes from preceding parts', () => {
      expect(joinUrl('foo/', 'bar')).toBe('foo/bar')
    })

    it('handles both leading and trailing slashes', () => {
      expect(joinUrl('foo/', '/bar')).toBe('foo/bar')
    })

    it('skips empty segments', () => {
      expect(joinUrl('foo', '', 'bar')).toBe('foo/bar')
    })

    it('returns the first non-empty segment when only one is present', () => {
      expect(joinUrl('foo')).toBe('foo')
    })

    it('handles absolute URL base', () => {
      expect(joinUrl('https://example.com', 'path')).toBe('https://example.com/path')
    })

    it('handles multiple slashes in base', () => {
      expect(joinUrl('https://example.com/', '/path/')).toBe('https://example.com/path/')
    })
  })

  describe('withLeadingSlash', () => {
    it('adds a leading slash when missing', () => {
      expect(withLeadingSlash('path')).toBe('/path')
    })

    it('preserves an existing leading slash', () => {
      expect(withLeadingSlash('/path')).toBe('/path')
    })

    it('handles empty string', () => {
      expect(withLeadingSlash('')).toBe('/')
    })
  })
})
