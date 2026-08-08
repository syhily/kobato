import type { ClearCacheTarget } from '@/shared/types/cache'

// Status reducer state for the "clear cache" buttons; `CacheView` owns one, per-bucket cards read it.
export interface ClearStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  /** Last-clicked target so the per-bucket button can show "clearing…" only on itself. */
  target: ClearCacheTarget | null
  message: string | null
}

export const idleClearStatus: ClearStatus = { state: 'idle', target: null, message: null }
