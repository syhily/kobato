import { describe, expect, it } from 'vitest'

import { SHIKI_THEME, SHIKI_THEMES, shikiTransformers } from '@/server/infra/rendering/shiki'

describe('shiki configuration', () => {
  it('exports the expected light and dark theme names', () => {
    expect(SHIKI_THEMES).toEqual({
      light: 'solarized-light',
      dark: 'solarized-dark',
    })
  })

  it('exports SHIKI_THEME as the light theme alias', () => {
    expect(SHIKI_THEME).toBe(SHIKI_THEMES.light)
  })

  it('returns an array of transformer functions', () => {
    const transformers = shikiTransformers()
    expect(transformers).toHaveLength(5)
    expect(transformers.every((t) => typeof t === 'object' && t !== null)).toBe(true)
  })
})
