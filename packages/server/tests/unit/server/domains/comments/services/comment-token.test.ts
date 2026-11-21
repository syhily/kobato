import {
  parseCommentTokensCookie,
  serializeCommentTokensCookie,
  type CommentTokenCookie,
} from '@kobato/server/domains/comments/services/comment-token'
import { describe, expect, it } from 'vitest'

describe('domains/comments/services — comment token cookie utilities', () => {
  const sample: CommentTokenCookie = {
    'post-1': [{ token: 'abc123', expiresAt: 1893456000000 }],
  }

  describe('parseCommentTokensCookie', () => {
    it('returns empty object for null header', () => {
      expect(parseCommentTokensCookie(null)).toEqual({})
    })

    it('returns empty object when cookie is absent', () => {
      expect(parseCommentTokensCookie('session=xyz; other=foo')).toEqual({})
    })

    it('parses a valid comment token cookie', () => {
      const serialized = serializeCommentTokensCookie(sample)
      const valueOnly = serialized.split(';')[0] as string
      expect(parseCommentTokensCookie(valueOnly)).toEqual(sample)
    })

    it('returns empty object for malformed cookie JSON', () => {
      expect(parseCommentTokensCookie('__comment_tokens=not-json')).toEqual({})
    })

    it('returns empty object for URL-decoding failure', () => {
      expect(parseCommentTokensCookie('__comment_tokens=%')).toEqual({})
    })
  })

  describe('serializeCommentTokensCookie', () => {
    it('produces a cookie string with correct name and attributes', () => {
      const cookie = serializeCommentTokensCookie(sample)
      expect(cookie).toContain('__comment_tokens=')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Max-Age=')
      expect(cookie).toMatch(/Max-Age=604800/)
    })

    it('omits the Secure attribute outside production (vitest runs with PROD=false)', () => {
      expect(serializeCommentTokensCookie(sample)).not.toContain('Secure')
    })

    it('round-trips through parse', () => {
      const serialized = serializeCommentTokensCookie(sample)
      const valueOnly = serialized.split(';')[0] as string
      expect(parseCommentTokensCookie(valueOnly)).toEqual(sample)
    })
  })
})
