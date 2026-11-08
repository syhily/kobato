import { describe, expect, it } from 'vitest'

import { rootMatchesWithI18n } from '#/_helpers/i18n'
import { meta } from '@/routes/public/archives'

describe('route: public/archives', () => {
  describe('meta', () => {
    it('returns an array containing the page title', () => {
      const result = meta({ matches: rootMatchesWithI18n() } as never)
      expect(Array.isArray(result)).toBe(true)
      expect(result).toContainEqual({ title: '归档 - 且听书吟' })
    })
  })
})
