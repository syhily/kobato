import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/security/users/index'

describe('route: admin/security/users/index', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '用户管理 - 且听书吟' })
    })
  })
})
