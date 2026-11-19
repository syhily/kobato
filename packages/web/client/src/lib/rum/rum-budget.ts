export const RUM_EVENT_LIMITS = {
  resourcesPerSession: 500,
  errorsPerSession: 100,
} as const

export interface RumBudgetSnapshot {
  sessionId: string
  resources: number
  errors: number
}

export interface RumBudgetStore {
  load: () => RumBudgetSnapshot | null
  save: (snapshot: RumBudgetSnapshot) => void
}

export interface RumSessionBudgetOptions {
  maxResourcesPerSession?: number
  maxErrorsPerSession?: number
  budgetStore?: RumBudgetStore
}

export interface RumSessionBudget {
  canAccept: (sessionId: string, type: string | null) => boolean
  commit: (sessionId: string, type: string | null) => void
  reset: () => void
}

export function createRumSessionBudget(options: RumSessionBudgetOptions = {}): RumSessionBudget {
  const maxResources = options.maxResourcesPerSession ?? RUM_EVENT_LIMITS.resourcesPerSession
  const maxErrors = options.maxErrorsPerSession ?? RUM_EVENT_LIMITS.errorsPerSession
  let sessionId: string | null = null
  let resources = 0
  let errors = 0

  const restore = (nextSession: string) => {
    resources = 0
    errors = 0
    const snapshot = options.budgetStore?.load()
    if (snapshot?.sessionId === nextSession) {
      resources = Math.min(Math.max(0, Math.trunc(snapshot.resources)), maxResources)
      errors = Math.min(Math.max(0, Math.trunc(snapshot.errors)), maxErrors)
    }
  }

  const enterSession = (nextSession: string) => {
    if (nextSession !== sessionId) {
      sessionId = nextSession
      restore(nextSession)
    }
  }

  const persist = () => {
    if (sessionId !== null) {
      options.budgetStore?.save({ sessionId, resources, errors })
    }
  }

  return {
    canAccept(nextSession, type) {
      enterSession(nextSession)
      if (type === 'resource') {
        return resources < maxResources
      }
      if (type === 'error') {
        return errors < maxErrors
      }
      return true
    },
    commit(nextSession, type) {
      enterSession(nextSession)
      if (type === 'resource') {
        resources += 1
      } else if (type === 'error') {
        errors += 1
      }
      persist()
    },
    reset() {
      sessionId = null
      resources = 0
      errors = 0
    },
  }
}
