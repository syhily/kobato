import { describe, expect, it } from 'vitest'

import { searchSchema } from '@/server/domains/settings/schemas/search'
import { INFRA_SEARCH_DEFAULTS } from '@/server/infra/search/defaults'

describe('infra/search — settings fallback', () => {
  it('is derived from the search schema defaults (drift is impossible)', () => {
    expect(INFRA_SEARCH_DEFAULTS).toEqual({
      ...searchSchema.shape.search.parse({ enabled: false, endpoint: '' }),
      apiKey: '',
    })
  })
})
