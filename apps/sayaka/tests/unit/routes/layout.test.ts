import { ErrorBoundary } from '@sayaka/routes/layout'
import { describe, expect, it } from 'vitest'

describe('route: public/layout', () => {
  describe('ErrorBoundary', () => {
    it('is defined and exportable', () => {
      expect(ErrorBoundary).toBeDefined()
      expect(typeof ErrorBoundary).toBe('function')
    })
  })
})
