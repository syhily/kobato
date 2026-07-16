import { describe, expect, it } from 'vitest'

import { SHIKI_THEMES, shikiTransformers } from '@/server/infra/pt/shiki'

describe('shiki configuration', () => {
  it('exports the expected light and dark theme names', () => {
    expect(SHIKI_THEMES).toEqual({
      light: 'solarized-light',
      dark: 'solarized-dark',
    })
  })

  it('returns an array of transformer functions', () => {
    const transformers = shikiTransformers()
    expect(transformers).toHaveLength(5)
    expect(transformers.every((t) => typeof t === 'object' && t !== null)).toBe(true)
  })
})
