import { describe, expect, it, vi } from 'vitest'

import {
  createRumSessionBudget,
  RUM_EVENT_LIMITS,
  type RumBudgetSnapshot,
  type RumBudgetStore,
} from '@/client/lib/rum-budget'

const SESSION = '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c7d'
const NEXT_SESSION = '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c7e'

function memoryStore(initial: RumBudgetSnapshot | null = null): RumBudgetStore & {
  snapshot: RumBudgetSnapshot | null
} {
  const store = {
    snapshot: initial,
    load: vi.fn(() => store.snapshot),
    save: vi.fn((snapshot: RumBudgetSnapshot) => {
      store.snapshot = snapshot
    }),
  }
  return store
}

describe('RumSessionBudget', () => {
  it('caps resources and errors at the documented limits', () => {
    const budget = createRumSessionBudget()
    for (let index = 0; index < RUM_EVENT_LIMITS.resourcesPerSession; index += 1) {
      expect(budget.canAccept(SESSION, 'resource')).toBe(true)
      budget.commit(SESSION, 'resource')
    }
    expect(budget.canAccept(SESSION, 'resource')).toBe(false)

    for (let index = 0; index < RUM_EVENT_LIMITS.errorsPerSession; index += 1) {
      expect(budget.canAccept(SESSION, 'error')).toBe(true)
      budget.commit(SESSION, 'error')
    }
    expect(budget.canAccept(SESSION, 'error')).toBe(false)
    // Non-budgeted event types are always accepted.
    expect(budget.canAccept(SESSION, 'long_task')).toBe(true)
  })

  it('restores a session snapshot and resets when the session id changes', () => {
    const store = memoryStore({ sessionId: SESSION, resources: 499, errors: 99 })
    const budget = createRumSessionBudget({ budgetStore: store })

    expect(budget.canAccept(SESSION, 'resource')).toBe(true)
    budget.commit(SESSION, 'resource')
    expect(store.snapshot).toEqual({ sessionId: SESSION, resources: 500, errors: 99 })
    expect(budget.canAccept(SESSION, 'resource')).toBe(false)

    expect(budget.canAccept(NEXT_SESSION, 'resource')).toBe(true)
    budget.commit(NEXT_SESSION, 'resource')
    expect(store.snapshot).toEqual({ sessionId: NEXT_SESSION, resources: 1, errors: 0 })
  })

  it('never lets a persisted snapshot exceed the configured cap', () => {
    const store = memoryStore({ sessionId: SESSION, resources: 900, errors: 900 })
    const budget = createRumSessionBudget({ budgetStore: store })

    expect(budget.canAccept(SESSION, 'resource')).toBe(false)
    expect(budget.canAccept(SESSION, 'error')).toBe(false)
  })

  it('reset clears in-memory state without deleting persisted snapshots', () => {
    const store = memoryStore({ sessionId: SESSION, resources: 500, errors: 100 })
    const budget = createRumSessionBudget({ budgetStore: store })
    expect(budget.canAccept(SESSION, 'resource')).toBe(false)

    budget.reset()
    // The persisted snapshot still owns the SAME session; a new session starts
    // from zero and overwrites the entry on commit.
    expect(budget.canAccept(SESSION, 'resource')).toBe(false)
    expect(budget.canAccept(NEXT_SESSION, 'resource')).toBe(true)
    expect(store.snapshot).toEqual({ sessionId: SESSION, resources: 500, errors: 100 })
  })
})
