import { rootMatchesWithI18n } from '@kobato/i18n/tests/utils/i18n'
import { meta } from '@kobato/web-admin/routes/admin/taxonomy/tags'
import { describe, expect, it } from 'vitest'

describe('route: admin/taxonomy/tags', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '标签管理 - 且听书吟' })
    })
  })
})
