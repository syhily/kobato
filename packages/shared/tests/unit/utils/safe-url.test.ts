import {
  httpUrlOrEmptyStringSchema,
  isAllowedMirrorUrl,
  isBlockedFetchHost,
  isValidPasskeyDomain,
  optionalHttpUrlSchema,
  safeHref,
  safeRedirectPath,
  tryParseUrl,
} from '@kobato/shared/utils/safe-url'
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
  })

  describe('optionalHttpUrlSchema', () => {
    it('accepts valid https URL', () => {
      expect(optionalHttpUrlSchema.parse('https://example.com')).toBe('https://example.com')
    })

    it('accepts undefined', () => {
      expect(optionalHttpUrlSchema.parse(undefined)).toBeUndefined()
    })

    it('accepts empty string as undefined', () => {
      expect(optionalHttpUrlSchema.parse('')).toBeUndefined()
    })

    it('rejects non-HTTP protocol', () => {
      expect(() => optionalHttpUrlSchema.parse('ftp://example.com')).toThrow()
    })
  })

  describe('httpUrlOrEmptyStringSchema', () => {
    it('accepts valid URL', () => {
      expect(httpUrlOrEmptyStringSchema.parse('https://example.com')).toBe('https://example.com')
    })

    it('accepts empty string', () => {
      expect(httpUrlOrEmptyStringSchema.parse('')).toBe('')
      expect(httpUrlOrEmptyStringSchema.parse(null)).toBe('')
    })

    it('rejects invalid URL', () => {
      expect(() => httpUrlOrEmptyStringSchema.parse('not-a-url')).toThrow()
    })
  })

  describe('isBlockedFetchHost', () => {
    it('blocks localhost names and loopback IPs', () => {
      expect(isBlockedFetchHost('localhost')).toBe(true)
      expect(isBlockedFetchHost('foo.localhost')).toBe(true)
      expect(isBlockedFetchHost('0.0.0.0')).toBe(true)
      expect(isBlockedFetchHost('::1')).toBe(true)
      expect(isBlockedFetchHost('[::1]')).toBe(true)
      expect(isBlockedFetchHost('127.0.0.1')).toBe(true)
    })

    it('blocks private IPv4 ranges', () => {
      expect(isBlockedFetchHost('10.0.0.1')).toBe(true)
      expect(isBlockedFetchHost('192.168.1.1')).toBe(true)
      expect(isBlockedFetchHost('169.254.169.254')).toBe(true)
      expect(isBlockedFetchHost('172.16.0.1')).toBe(true)
    })

    it('blocks IPv6 ULA / link-local ranges', () => {
      expect(isBlockedFetchHost('fc00::1')).toBe(true)
      expect(isBlockedFetchHost('fd12::1')).toBe(true)
      expect(isBlockedFetchHost('fe80::1')).toBe(true)
      expect(isBlockedFetchHost('[fc00::1]')).toBe(true)
    })

    it('blocks zone-ID-suffixed spellings of private IPv6 addresses', () => {
      expect(isBlockedFetchHost('fe80::1%eth0')).toBe(true) // RFC 6874 zone-ID
      expect(isBlockedFetchHost('fe80::1%25eth0')).toBe(true) // URL-encoded zone-ID
      expect(isBlockedFetchHost('[fe80::1%eth0]')).toBe(true)
      expect(isBlockedFetchHost('fc00::1%1')).toBe(true)
    })

    it('blocks non-canonical IPv4 spellings of private addresses', () => {
      expect(isBlockedFetchHost('0x7f000001')).toBe(true) // hex 127.0.0.1
      expect(isBlockedFetchHost('2130706433')).toBe(true) // decimal 127.0.0.1
      expect(isBlockedFetchHost('127.1')).toBe(true) // short dotted 127.0.0.1
      expect(isBlockedFetchHost('0177.0.0.1')).toBe(true) // octal 127.0.0.1
      expect(isBlockedFetchHost('0xA9FEA9FE')).toBe(true) // hex 169.254.169.254
      expect(isBlockedFetchHost('10.1')).toBe(true) // short dotted 10.0.0.1
    })

    it('blocks IPv4-mapped IPv6 forms of private addresses', () => {
      expect(isBlockedFetchHost('::ffff:127.0.0.1')).toBe(true)
      expect(isBlockedFetchHost('[::ffff:127.0.0.1]')).toBe(true)
      expect(isBlockedFetchHost('[::ffff:7f00:1]')).toBe(true) // URL-normalized spelling
      expect(isBlockedFetchHost('::ffff:169.254.169.254')).toBe(true)
      expect(isBlockedFetchHost('::ffff:10.0.0.1')).toBe(true)
    })

    it('blocks IPv6 loopback and unspecified addresses in any spelling', () => {
      expect(isBlockedFetchHost('0:0:0:0:0:0:0:1')).toBe(true)
      expect(isBlockedFetchHost('::')).toBe(true)
      expect(isBlockedFetchHost('0:0:0:0:0:0:0:0')).toBe(true)
    })

    it('still blocks 127-prefixed domain names via the literal first layer', () => {
      expect(isBlockedFetchHost('127.0.0.1.nip.io')).toBe(true)
    })

    it('allows public hosts and IPs', () => {
      expect(isBlockedFetchHost('gravatar.com')).toBe(false)
      expect(isBlockedFetchHost('p3.music.126.net')).toBe(false)
      expect(isBlockedFetchHost('example.com')).toBe(false)
      expect(isBlockedFetchHost('8.8.8.8')).toBe(false)
      expect(isBlockedFetchHost('0x08080808')).toBe(false) // hex 8.8.8.8
      expect(isBlockedFetchHost('::ffff:8.8.8.8')).toBe(false) // mapped public IP
      expect(isBlockedFetchHost('[::ffff:808:808]')).toBe(false)
      expect(isBlockedFetchHost('2606:4700::1%eth0')).toBe(false) // zone-ID on a public address stays public
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

  describe('isValidPasskeyDomain', () => {
    it('accepts a public https origin', () => {
      expect(isValidPasskeyDomain('https://example.com')).toBe(true)
    })

    it('rejects http origins', () => {
      expect(isValidPasskeyDomain('http://example.com')).toBe(false)
    })

    it('rejects localhost and loopback addresses', () => {
      expect(isValidPasskeyDomain('https://localhost')).toBe(false)
      expect(isValidPasskeyDomain('https://127.0.0.1')).toBe(false)
      expect(isValidPasskeyDomain('https://[::1]')).toBe(false)
    })

    it('rejects private IPv4 ranges', () => {
      expect(isValidPasskeyDomain('https://10.0.0.1')).toBe(false)
      expect(isValidPasskeyDomain('https://192.168.1.1')).toBe(false)
    })

    it('rejects malformed input', () => {
      expect(isValidPasskeyDomain('not-a-url')).toBe(false)
      expect(isValidPasskeyDomain('')).toBe(false)
    })
  })

  describe('isAllowedMirrorUrl', () => {
    it('accepts known gravatar mirrors over https', () => {
      expect(isAllowedMirrorUrl('https://gravatar.com/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://cn.gravatar.com/avatar/')).toBe(true)
    })

    it('accepts common community gravatar-compatible mirrors', () => {
      expect(isAllowedMirrorUrl('https://cdn.v2ex.com/gravatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://sdn.geekzu.org/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.loli.net/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://cravatar.cn/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://seccdn.libravatar.org/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://weavatar.com/avatar/')).toBe(true)
      expect(isAllowedMirrorUrl('https://gravatar.webp.se/avatar/')).toBe(true)
    })

    it('rejects non-gravatar hosts', () => {
      expect(isAllowedMirrorUrl('https://example.com/avatar/')).toBe(false)
      expect(isAllowedMirrorUrl('https://evil.com/')).toBe(false)
    })

    it('rejects cloud metadata endpoints', () => {
      expect(isAllowedMirrorUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
    })

    it('rejects loopback / private ranges', () => {
      expect(isAllowedMirrorUrl('https://127.0.0.1/')).toBe(false)
      expect(isAllowedMirrorUrl('https://10.0.0.1/')).toBe(false)
      expect(isAllowedMirrorUrl('https://192.168.1.1/')).toBe(false)
    })

    it('rejects http (non-tls) urls', () => {
      expect(isAllowedMirrorUrl('http://gravatar.com/avatar/')).toBe(false)
    })

    it('rejects malformed urls', () => {
      expect(isAllowedMirrorUrl('not-a-url')).toBe(false)
      expect(isAllowedMirrorUrl('')).toBe(false)
    })
  })
})
