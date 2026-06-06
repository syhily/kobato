import type { ClearCacheTarget } from '@/shared/types/cache'

// Status reducer state for the "clear cache" buttons. The parent
// `CacheView` owns one of these; per-bucket cards read it to render
export interface ClearStatus {
  state: 'idle' | 'pending' | 'success' | 'error'
  /** Last-clicked target so the per-bucket button can show "清空中…" only on itself. */
  target: ClearCacheTarget | null
  message: string | null
}

export const idleClearStatus: ClearStatus = { state: 'idle', target: null, message: null }
