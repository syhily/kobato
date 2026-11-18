import { likeCacheKeyParts } from '@kobato/server/domains/posts/services/search-query.ts'
import { describe, expect, it } from 'vitest'

describe('posts/search-query — cache key parts', () => {
  it('hashes only the query', () => {
    expect(likeCacheKeyParts('hello')).toEqual(['hello'])
  })
})
