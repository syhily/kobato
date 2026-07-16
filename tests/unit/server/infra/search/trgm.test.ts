import { describe, expect, it } from 'vitest'

import type { SearchSettings } from '@/shared/config/types'

import { trgmCacheKeyParts } from '@/server/infra/search/trgm'

const settings: SearchSettings['search'] = {
  enabled: false,
  mode: 'trgm',
  endpoint: '',
  apiKey: '',
  model: 'text-embedding-3-small',
  similarityThreshold: 0.5,
  trgmThreshold: 0.3,
}

describe('infra/search trgm mode — cache key parts', () => {
  it('includes the trgm threshold — it changes the fuzzy-match result set', () => {
    expect(trgmCacheKeyParts(settings, 'hello')).toEqual(['trgm', 'hello', '0.3'])
    expect(trgmCacheKeyParts({ ...settings, trgmThreshold: 0.9 }, 'hello')).toEqual(['trgm', 'hello', '0.9'])
  })

  it('excludes the similarity threshold — it does not affect trgm results', () => {
    const parts = trgmCacheKeyParts({ ...settings, similarityThreshold: 0.9 }, 'hello')
    expect(parts).toEqual(['trgm', 'hello', '0.3'])
  })
})
