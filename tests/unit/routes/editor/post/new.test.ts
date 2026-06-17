import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/editor/post/new'

describe('route: editor/post/new', () => {
  describe('meta', () => {
    it('returns meta tags with the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '新建文章 - 且听书吟' })
    })
  })
})
