import { describe, expect, it } from 'vitest'

import { ErrorBoundary } from '@/routes/public/layout'

describe('route: public/layout', () => {
  describe('ErrorBoundary', () => {
    it('is defined and exportable', () => {
      expect(ErrorBoundary).toBeDefined()
      expect(typeof ErrorBoundary).toBe('function')
    })
  })
})
