import { describe, expect, it } from 'vitest'

import { ErrorBoundary } from '@/routes/admin/settings/layout'

// The layout's loader path imports the settings service, whose
// section-change wiring pulls in the backup/audit schedulers (and
// transitively the DB bootstrap) — irrelevant to the ErrorBoundary.
describe('route: admin/settings/layout', () => {
  describe('ErrorBoundary', () => {
    it('is defined and exportable', () => {
      expect(ErrorBoundary).toBeDefined()
      expect(typeof ErrorBoundary).toBe('function')
    })
  })
})
