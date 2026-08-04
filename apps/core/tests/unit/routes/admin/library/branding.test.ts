import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/library/branding'

describe('route: admin/library/branding', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '品牌素材 - 且听书吟' })
    })
  })
})
