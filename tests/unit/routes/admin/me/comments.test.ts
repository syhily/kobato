import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/me/comments'

describe('route: admin/me/comments', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '我的评论 - 且听书吟' })
    })
  })
})
