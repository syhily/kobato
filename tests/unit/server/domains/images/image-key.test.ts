import { describe, expect, it } from 'vitest'

import { buildObjectKey, extractHostForFriendKey } from '@/server/domains/images/key'
import { DomainError } from '@/server/infra/http/errors'

describe('server/images/key — buildObjectKey', () => {
  describe('kind: generic', () => {
    it('embeds yyyy/MM in the prefix and zero-pads each timestamp component', () => {
      // The generic key is built from UTC components, keeping the test timezone-stable.
      const now = new Date(Date.UTC(2026, 0, 7, 3, 4, 5, 987))
      const key = buildObjectKey({ kind: 'generic', now })
      // 987 ms % 100 = 87 → trailing `87`.
      expect(key).toBe('images/2026/01/2026010703040587.jpg')
    })

    it('zero-pads the ms-mod-100 segment when the remainder is single-digit', () => {
      const now = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 4))
      const key = buildObjectKey({ kind: 'generic', now })
      // 4 ms % 100 = 4 → trailing `04` after the seconds.
      expect(key).toBe('images/2026/12/2026123123595904.jpg')
    })
  })

  describe('kind: category', () => {
    it('encodes the slug under images/categories/', () => {
      expect(buildObjectKey({ kind: 'category', slug: 'coding' })).toBe('images/categories/coding.jpg')
      expect(buildObjectKey({ kind: 'category', slug: 'big-data' })).toBe('images/categories/big-data.jpg')
    })

    it('rejects slugs containing path separators or non-ASCII characters', () => {
      expect(() => buildObjectKey({ kind: 'category', slug: '../escape' })).toThrow(DomainError)
      expect(() => buildObjectKey({ kind: 'category', slug: 'has space' })).toThrow(DomainError)
      expect(() => buildObjectKey({ kind: 'category', slug: '中文' })).toThrow(DomainError)
      expect(() => buildObjectKey({ kind: 'category', slug: 'BIG' })).toThrow(DomainError)
    })
  })

  describe('kind: friend', () => {
    it('encodes the host under images/links/', () => {
      expect(buildObjectKey({ kind: 'friend', host: 'blog.example.com' })).toBe('images/links/blog.example.com.jpg')
      expect(buildObjectKey({ kind: 'friend', host: 'foo-bar.dev' })).toBe('images/links/foo-bar.dev.jpg')
    })

    it('rejects hosts with a slash', () => {
      expect(() => buildObjectKey({ kind: 'friend', host: 'blog.example.com/path' })).toThrow(DomainError)
    })
  })
})

describe('server/images/key — extractHostForFriendKey', () => {
  it('strips scheme + port + path + query and lowercases the host', () => {
    expect(extractHostForFriendKey('https://Example.COM:8080/path?q=1')).toBe('example.com')
    expect(extractHostForFriendKey('http://blog.foo.com/post/1')).toBe('blog.foo.com')
  })

  it('rejects values that are not parseable URLs', () => {
    expect(() => extractHostForFriendKey('not-a-url')).toThrow(DomainError)
    expect(() => extractHostForFriendKey('')).toThrow(DomainError)
  })

  it('returns punycoded host for IDN URLs (whitelist still accepts xn-- form)', () => {
    // URL.hostname returns the punycode form, so `xn--` must pass the lowercase-ASCII whitelist.
    expect(extractHostForFriendKey('https://测试.example')).toMatch(/^xn--[a-z0-9.-]+$/)
  })
})
