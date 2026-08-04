import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/library/music'

describe('route: admin/library/music', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '音乐管理 - 且听书吟' })
    })
  })
})
