import { describe, expect, it } from 'vitest'

import type { SearchSettings } from '@/shared/config/types'

import { vectorCacheKeyParts } from '@/server/infra/search/vector'

const settings: SearchSettings['search'] = {
  enabled: true,
  mode: 'vector',
  endpoint: '',
  apiKey: 'sk-test',
  model: 'text-embedding-3-small',
  similarityThreshold: 0.5,
  trgmThreshold: 0.3,
}

describe('infra/search vector mode — cache key parts', () => {
  it('includes the similarity threshold and the embedding model', () => {
    expect(vectorCacheKeyParts(settings, 'hello')).toEqual(['vector', 'hello', '0.5', 'text-embedding-3-small'])
  })

  it('changes when either knob changes', () => {
    const base = vectorCacheKeyParts(settings, 'hello')
    expect(vectorCacheKeyParts({ ...settings, similarityThreshold: 0.7 }, 'hello')).not.toEqual(base)
    expect(vectorCacheKeyParts({ ...settings, model: 'text-embedding-3-large' }, 'hello')).not.toEqual(base)
  })
})
