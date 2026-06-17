import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/me/profile'

describe('route: admin/me/profile', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '个人信息 - 且听书吟' })
    })
  })
})
