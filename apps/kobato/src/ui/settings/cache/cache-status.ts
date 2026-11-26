import type { ClearCacheTarget } from '@kobato/settings/cache-bucket'

export interface ClearStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  target: ClearCacheTarget | null
  message: string | null
}

export const idleClearStatus: ClearStatus = { state: 'idle', target: null, message: null }
