import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/pages/index'

describe('route: admin/pages/index', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '页面管理 - 且听书吟' })
    })
  })
})
