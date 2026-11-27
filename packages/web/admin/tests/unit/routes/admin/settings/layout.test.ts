import { ErrorBoundary } from '@kobato/web-admin/routes/admin/settings/layout'
import { describe, expect, it } from 'vitest'

describe('route: admin/settings/layout', () => {
  describe('ErrorBoundary', () => {
    it('is defined and exportable', () => {
      expect(ErrorBoundary).toBeDefined()
      expect(typeof ErrorBoundary).toBe('function')
    })
  })
})
