import {
  adminCacheStatsDto,
  adminCacheClearInput,
  adminCacheGetStatsInput,
  clearCacheResultDto,
} from '@kobato/contracts/cache'
import { oc } from '@orpc/contract'

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
