import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/posts/index'

describe('route: admin/posts/index', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '文章管理 - 且听书吟' })
    })
  })
})
