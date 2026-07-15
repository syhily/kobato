import { describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '@/routes/admin/settings/layout'

// The layout's loader path imports the settings service, whose
// section-change wiring pulls in the backup/audit schedulers (and
// transitively the DB bootstrap) — irrelevant to the ErrorBoundary.
vi.mock('@/server/domains/settings/services/section-changes', () => ({
  SECTION_CHANGE_HANDLERS: new Map(),
}))

describe('route: admin/settings/layout', () => {
  describe('ErrorBoundary', () => {
    it('is defined and exportable', () => {
      expect(ErrorBoundary).toBeDefined()
      expect(typeof ErrorBoundary).toBe('function')
    })
  })
})
