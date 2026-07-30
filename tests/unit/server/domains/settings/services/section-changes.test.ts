import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __clearSectionChangeHandlersForTests,
  registerSectionChangeHandler,
  sectionChangeHandler,
} from '@/server/domains/settings/services/section-changes'

// The registry is inert on import — handlers arrive from the
// bootstrap composition root (the db-lifecycle wiring is covered by
// the bootstrap tests, not here).
describe('server/domains/settings/services/section-changes', () => {
  beforeEach(() => {
    __clearSectionChangeHandlersForTests()
  })

  it('is empty before registration (no import-time side effects)', () => {
    expect(sectionChangeHandler('backup')).toBeUndefined()
  })

  it('returns a registered handler per section', () => {
    const handler = vi.fn()
    registerSectionChangeHandler('backup', handler)

    expect(sectionChangeHandler('backup')).toBe(handler)
    expect(sectionChangeHandler('limits')).toBeUndefined()
  })

  it('re-registration replaces the handler', async () => {
    const first = vi.fn()
    const second = vi.fn()
    registerSectionChangeHandler('mail', first)
    registerSectionChangeHandler('mail', second)

    await sectionChangeHandler('mail')?.()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('clears all registrations (the test seam)', () => {
    registerSectionChangeHandler('backup', vi.fn())
    registerSectionChangeHandler('limits', vi.fn())
    __clearSectionChangeHandlersForTests()

    expect(sectionChangeHandler('backup')).toBeUndefined()
    expect(sectionChangeHandler('limits')).toBeUndefined()
  })
})
