import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/library/images'

describe('route: admin/library/images', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '图片管理 - 且听书吟' })
    })
  })
})
