import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/public/categories'

describe('route: public/categories', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '分类 - 且听书吟' })
    })
  })
})
