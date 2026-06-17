import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/taxonomy/categories'

describe('route: admin/taxonomy/categories', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '分类管理 - 且听书吟' })
    })
  })
})
