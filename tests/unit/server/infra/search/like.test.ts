import { describe, expect, it } from 'vitest'

import type { SearchSettings } from '@/shared/config/types'

import { likeCacheKeyParts } from '@/server/infra/search/like'

const settings: SearchSettings['search'] = {
  enabled: false,
  mode: 'like',
  endpoint: '',
  apiKey: '',
  model: 'text-embedding-3-small',
  similarityThreshold: 0.5,
  trgmThreshold: 0.3,
}

describe('infra/search like mode — cache key parts', () => {
  it('hashes only the mode and the query', () => {
    expect(likeCacheKeyParts(settings, 'hello')).toEqual(['like', 'hello'])
  })

  it('excludes the similarity threshold — it does not affect LIKE results', () => {
    const parts = likeCacheKeyParts({ ...settings, similarityThreshold: 0.9 }, 'hello')
    expect(parts).toEqual(['like', 'hello'])
  })
})
