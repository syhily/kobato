import { describe, expect, it } from 'vitest'

import { rootMatchesWithI18n } from '#/_helpers/i18n'
import { meta } from '@/routes/admin/library/music/detail'

describe('route: admin/library/music/detail', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '歌曲详情 - 且听书吟' })
    })
  })
})
