import { rootMatchesWithI18n } from '@kobato/i18n/tests/utils/i18n'
import { meta } from '@kobato/web-admin/routes/admin/library/images'
import { describe, expect, it } from 'vitest'

describe('route: admin/library/images', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '图片管理 - 且听书吟' })
    })
  })
})
