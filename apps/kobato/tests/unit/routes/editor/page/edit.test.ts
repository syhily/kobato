import { rootMatchesWithI18n } from '@kobato/i18n/tests/utils/i18n.ts'
import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/editor/page/edit.tsx'

describe('route: editor/page/edit', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '编辑页面 - 且听书吟' })
    })
  })
})
