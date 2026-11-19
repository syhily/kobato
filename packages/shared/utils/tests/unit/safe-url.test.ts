import { redactUrlForLog, safeHref, safeRedirectPath, tryParseUrl } from '@kobato/utils/safe-url.ts'
import { describe, expect, it } from 'vitest'

describe('client: safe-url utilities', () => {
  describe('safeHref', () => {
    it('returns undefined for null/undefined/empty', () => {
      expect(safeHref(null)).toBeUndefined()
      expect(safeHref(undefined)).toBeUndefined()
      expect(safeHref('')).toBeUndefined()
      expect(safeHref('  ')).toBeUndefined()
    })

    it('returns the URL for valid http(s) URLs', () => {
      expect(safeHref('https://example.com')).toBe('https://example.com')
      expect(safeHref('http://localhost:3000')).toBe('http://localhost:3000')
    })

    it('returns undefined for non-HTTP protocols', () => {
      expect(safeHref('javascript:alert(1)')).toBeUndefined()
      expect(safeHref('ftp://example.com')).toBeUndefined()
      expect(safeHref('data:text/html,foo')).toBeUndefined()
    })

    it('returns undefined for invalid URLs', () => {
      expect(safeHref('not-a-url')).toBeUndefined()
    })
  })

  describe('safeRedirectPath', () => {
    const origin = 'https://example.com'

    it('returns fallback for null/undefined/empty', () => {
      expect(safeRedirectPath(null, '/home', origin)).toBe('/home')
      expect(safeRedirectPath(undefined, '/home', origin)).toBe('/home')
      expect(safeRedirectPath('', '/home', origin)).toBe('/home')
    })

    it('returns path for same-origin redirect', () => {
      expect(safeRedirectPath('/dashboard', '/home', origin)).toBe('/dashboard')
    })

    it('returns fallback for cross-origin redirect', () => {
      expect(safeRedirectPath('https://evil.com/phish', '/home', origin)).toBe('/home')
    })

    it('preserves query and hash', () => {
      expect(safeRedirectPath('/path?foo=1#bar', '/home', origin)).toBe('/path?foo=1#bar')
    })

    it('returns fallback for dot-segment paths that normalize to a network-path reference', () => {
      expect(safeRedirectPath('/..//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/.//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/%2e%2e//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/a/..//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/a/%2e%2e//evil.com', '/home', origin)).toBe('/home')
    })

    it('returns fallback for explicit network-path and backslash references', () => {
      expect(safeRedirectPath('//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/\\evil.com', '/home', origin)).toBe('/home')
    })

    it('returns fallback for control characters', () => {
      expect(safeRedirectPath('/admin\u0000//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/admin\n//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/admin\r//evil.com', '/home', origin)).toBe('/home')
      expect(safeRedirectPath('/admin\u007f', '/home', origin)).toBe('/home')
    })

    it('keeps a normal same-origin path with a query', () => {
      expect(safeRedirectPath('/admin?x=1', '/home', origin)).toBe('/admin?x=1')
    })
  })

  describe('tryParseUrl', () => {
    it('returns a URL object for valid URLs', () => {
      const parsed = tryParseUrl('https://example.com/path?foo=1#bar')
      expect(parsed).not.toBeNull()
      expect(parsed?.hostname).toBe('example.com')
      expect(parsed?.pathname).toBe('/path')
    })

    it('returns null for invalid URLs', () => {
      expect(tryParseUrl('not-a-url')).toBeNull()
      expect(tryParseUrl('')).toBeNull()
    })
  })

  describe('redactUrlForLog', () => {
    it('keeps only origin and pathname, dropping credentials, query, and fragment', () => {
      expect(redactUrlForLog('https://user:secret@cdn.example.com/a/b.jpg?sign=abc123&e=999#frag')).toBe(
        'https://cdn.example.com/a/b.jpg',
      )
    })

    it('returns a placeholder for an unparsable URL', () => {
      expect(redactUrlForLog('not-a-url')).toBe('<unparsable>')
      expect(redactUrlForLog('')).toBe('<unparsable>')
    })
  })
})
