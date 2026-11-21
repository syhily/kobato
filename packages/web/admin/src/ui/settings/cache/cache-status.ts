import type { ClearCacheTarget } from '@kobato/cache/types'

export interface ClearStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  target: ClearCacheTarget | null
  message: string | null
}

export const idleClearStatus: ClearStatus = { state: 'idle', target: null, message: null }
