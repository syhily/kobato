import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/public/page/detail'

describe('route: public/page/detail', () => {
  describe('meta', () => {
    it('falls back to base meta when loaderData is missing', () => {
      const result = meta({ loaderData: undefined, matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '且听书吟 - 诗与梦想的远方' })
    })

    it('emits page seo meta when loaderData is present', () => {
      const page = {
        title: 'About',
        slug: 'about',
        summary: 'About page',
        permalink: '/about',
        date: '2024-01-01T00:00:00.000Z',
      }
      const result = meta({ loaderData: { page }, matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: 'About - 且听书吟' })
    })
  })
})
