import { getLogger } from '@/server/infra/logger'

const log = getLogger('restore.state')

export type RestorePhase = 'idle' | 'draining' | 'restoring' | 'completed' | 'failed'

export interface RestoreState {
  phase: RestorePhase
  startedAt: string
  error?: string
}

let restoreState: RestoreState = { phase: 'idle', startedAt: '' }

export function setRestoreState(phase: RestorePhase, error?: string): void {
  restoreState = { phase, startedAt: new Date().toISOString(), error }
  log.info('Restore state changed', { phase, err: error })
}

export function getRestoreState(): RestoreState {
  return restoreState
}

export function resetRestoreState(): void {
  restoreState = { phase: 'idle', startedAt: '' }
}
