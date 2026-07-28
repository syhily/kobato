import { describe, expect, it } from 'vitest'

import { parseCommentEntity, serializeCommentEntity } from '@/shared/utils/comments'

describe('shared/utils/comments', () => {
  describe('parseCommentEntity', () => {
    it('parses a valid post entity', () => {
      expect(parseCommentEntity('post:42')).toEqual({ type: 'post', ownerId: 42 })
    })

    it('parses a valid page entity', () => {
      expect(parseCommentEntity('page:7')).toEqual({ type: 'page', ownerId: 7 })
    })

    it('returns null for missing or empty input', () => {
      expect(parseCommentEntity(null)).toBeNull()
      expect(parseCommentEntity(undefined)).toBeNull()
      expect(parseCommentEntity('')).toBeNull()
    })

    it('returns null when the separator is missing', () => {
      expect(parseCommentEntity('post42')).toBeNull()
    })

    it('returns null for an unknown entity type', () => {
      expect(parseCommentEntity('user:42')).toBeNull()
    })

    it('returns null when the owner id is not numeric', () => {
      expect(parseCommentEntity('post:abc')).toBeNull()
    })

    it('returns null when the owner id is out of BigInt range', () => {
      expect(parseCommentEntity('post:1e309')).toBeNull()
    })
  })

  describe('serializeCommentEntity', () => {
    it('serializes a parsed entity back to the wire form', () => {
      expect(serializeCommentEntity({ type: 'post', ownerId: 42 })).toBe('post:42')
      expect(serializeCommentEntity({ type: 'page', ownerId: 7 })).toBe('page:7')
    })

    it('round-trips through parseCommentEntity', () => {
      const original = { type: 'post' as const, ownerId: 123 }
      expect(parseCommentEntity(serializeCommentEntity(original))).toEqual(original)
    })
  })
})
