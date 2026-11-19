import { rootMatchesWithI18n } from '@tests/utils/i18n.ts'
import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/library/images.tsx'

describe('route: admin/library/images', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '图片管理 - 且听书吟' })
    })
  })
})
