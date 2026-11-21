import { rootMatchesWithI18n } from '@kobato/i18n/tests/utils/i18n.ts'
import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/admin/library/music/detail.tsx'

describe('route: admin/library/music/detail', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '歌曲详情 - 且听书吟' })
    })
  })
})
