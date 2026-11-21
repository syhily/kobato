import type { Database } from '@kobato/db/database'

import { getLogger } from '@kobato/server/infra/logger'

export type RestorePhase = 'idle' | 'draining' | 'restoring' | 'completed' | 'failed'

export interface RestoreJobStatus {
  phase: RestorePhase
  startedAt: string
  error?: string
  configApplied?: boolean
}

export interface RestoreMachineDeps {
  drain(): Promise<void> | void
  prepareForSwap(): Promise<void> | void
  reopenAfterSwap(): Promise<Database>
  complete(success: boolean, error?: Error): Promise<void>
}

const log = getLogger('backup.restore-machine')

let deps: RestoreMachineDeps | null = null
let current: RestoreJobStatus | null = null
let last: RestoreJobStatus | null = null

export function wireRestoreMachine(d: RestoreMachineDeps): void {
  deps = d
}

export function resetRestoreMachine(): void {
  deps = null
  current = null
  last = null
}

function setPhase(phase: RestorePhase, error?: string): void {
  if (current === null) {
    return
  }
  current = { phase, startedAt: new Date().toISOString(), error }
  log.info('Restore state changed', { phase, err: error })
}

export function tryBeginRestore(): boolean {
  if (deps === null || current !== null) {
    return false
  }
  current = { phase: 'draining', startedAt: new Date().toISOString() }
  return true
}

export function abortRestoreClaim(): void {
  if (current?.phase === 'draining') {
    current = null
  }
}

export interface RestoreJobInput {
  restoreFn: () => Promise<RestoreChainResult>
  afterReopenFn?: (db: Database) => Promise<void>
  onFailureFn?: () => Promise<void> | void
}

export type RestoreChainResult = { configApplied?: boolean } | undefined

export async function withRestoreClaim(
  prepare: () => Promise<RestoreJobInput | null>,
): Promise<'busy' | 'declined' | 'started'> {
  if (!tryBeginRestore()) {
    return 'busy'
  }
  let job: RestoreJobInput | null
  try {
    job = await prepare()
  } catch (error) {
    abortRestoreClaim()
    throw error
  }
  if (job === null) {
    abortRestoreClaim()
    return 'declined'
  }
  startRestoreJob(job.restoreFn, job.afterReopenFn, job.onFailureFn)
  return 'started'
}

export function peekRestoreJobPhase(): RestoreJobStatus {
  if (current !== null) {
    return current
  }
  if (last !== null) {
    return last
  }
  return { phase: 'idle', startedAt: '' }
}

export function consumeRestoreJobReport(): RestoreJobStatus {
  if (current !== null) {
    return current
  }
  if (last !== null) {
    const report = last
    last = null
    return report
  }
  return { phase: 'idle', startedAt: '' }
}

export function startRestoreJob(
  restoreFn: () => Promise<RestoreChainResult>,
  afterReopenFn?: (db: Database) => Promise<void>,
  onFailureFn?: () => Promise<void> | void,
): void {
  if (deps === null || current === null) {
    log.error('startRestoreJob without a claimed slot — ignored')
    return
  }
  const machineDeps = deps

  const promise = (async () => {
    let success = false
    let error: Error | undefined
    let swapStarted = false
    let configApplied: boolean | undefined

    try {
      await machineDeps.drain()

      await machineDeps.prepareForSwap()
      setPhase('restoring')
      swapStarted = true
      const outcome = await restoreFn()
      configApplied = outcome?.configApplied

      const db = await machineDeps.reopenAfterSwap()
      await afterReopenFn?.(db)

      success = true
      log.info('Restore completed successfully')
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      log.error('Restore failed', { err: error.message })
      if (!swapStarted && onFailureFn !== undefined) {
        try {
          await onFailureFn()
        } catch (cleanupErr) {
          log.warn('Restore failure cleanup failed', {
            err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          })
        }
      }
    }

    try {
      await machineDeps.complete(success, error)
    } catch (err) {
      log.error('Restore completion handler failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
    last = {
      phase: success ? 'completed' : 'failed',
      startedAt: new Date().toISOString(),
      error: error?.message,
      configApplied,
    }
    current = null
  })()

  promise.catch((err) => {
    log.error('Restore machine crashed', {
      err: err instanceof Error ? err.message : String(err),
    })
    last = { phase: 'failed', startedAt: new Date().toISOString(), error: String(err) }
    current = null
  })
}
