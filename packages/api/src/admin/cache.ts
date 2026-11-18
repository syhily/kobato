import {
  adminCacheStatsDto,
  adminCacheClearInput,
  adminCacheGetStatsInput,
  clearCacheResultDto,
} from '@kobato/contracts/cache.ts'
import { oc } from '@orpc/contract'

// Admin cache RPC contract — admin base on the server.
export const adminCacheContract = {
  getStats: oc
    .route({ method: 'GET', path: '/admin/cache/get-stats' })
    .input(adminCacheGetStatsInput)
    .output(adminCacheStatsDto),
  clear: oc
    .route({ method: 'POST', path: '/admin/cache/clear' })
    .input(adminCacheClearInput)
    .output(clearCacheResultDto),
}
