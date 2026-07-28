import { describe, expect, it } from 'vitest'

import { likeCacheKeyParts } from '@/server/infra/search/like'

describe('infra/search like mode — cache key parts', () => {
  it('hashes only the query', () => {
    expect(likeCacheKeyParts('hello')).toEqual(['hello'])
  })
})
