import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/public/search/list'

describe('route: public/search/list', () => {
  describe('meta', () => {
    it('falls back to base meta when loaderData has no seo', () => {
      const result = meta({ loaderData: { title: 'react' }, matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '且听书吟 - 诗与梦想的远方' })
    })

    it('uses loader seo when provided', () => {
      const result = meta({ loaderData: { seo: [{ name: 'x', content: 'y' }] }, matches: [] } as never)
      expect(result).toEqual([{ name: 'x', content: 'y' }])
    })
  })
})
