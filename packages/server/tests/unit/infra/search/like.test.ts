import { likeCacheKeyParts } from '@kobato/server/infra/search/like'
import { describe, expect, it } from 'vitest'

describe('infra/search like mode — cache key parts', () => {
  it('hashes only the query', () => {
    expect(likeCacheKeyParts('hello')).toEqual(['hello'])
  })
})
