import { rootMatchesWithI18n } from '@kobato/i18n/tests/utils/i18n'
import { meta } from '@kobato/web-admin/routes/admin/library/branding'
import { describe, expect, it } from 'vitest'

describe('route: admin/library/branding', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '品牌素材 - 且听书吟' })
    })
  })
})
