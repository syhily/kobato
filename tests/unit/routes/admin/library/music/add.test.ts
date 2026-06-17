import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/library/music/add'

describe('route: admin/library/music/add', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '添加音乐 - 且听书吟' })
    })
  })
})
