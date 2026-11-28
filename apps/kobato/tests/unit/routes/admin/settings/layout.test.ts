import { describe, expect, it } from 'vitest'

import { ErrorBoundary } from '@/routes/admin/settings/layout'

describe('route: admin/settings/layout', () => {
  describe('ErrorBoundary', () => {
    it('is defined and exportable', () => {
      expect(ErrorBoundary).toBeDefined()
      expect(typeof ErrorBoundary).toBe('function')
    })
  })
})
