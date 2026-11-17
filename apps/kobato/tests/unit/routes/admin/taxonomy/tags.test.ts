import { rootMatchesWithI18n } from '@kobato/test-helpers/i18n.ts'
import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/taxonomy/tags'

describe('route: admin/taxonomy/tags', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '标签管理 - 且听书吟' })
    })
  })
})
