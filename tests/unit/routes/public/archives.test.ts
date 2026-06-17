import { describe, expect, it } from 'vitest'

import { meta } from '@/routes/public/archives'

describe('route: public/archives', () => {
  describe('meta', () => {
    it('returns an array containing the page title', () => {
      const result = meta({ matches: [] } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '归档 - 且听书吟' })
    })
  })
})
