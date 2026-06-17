import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/editor/page/edit'

describe('route: editor/page/edit', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '编辑页面 - 且听书吟' })
    })
  })
})
