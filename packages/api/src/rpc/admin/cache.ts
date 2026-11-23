import {
  adminCacheStatsDto,
  adminCacheClearInput,
  adminCacheGetStatsInput,
  clearCacheResultDto,
} from '@kobato/api/contracts/admin/cache'
import { defineProcedure } from '@kobato/api/rpc/define-procedure'

export const adminCacheContract = {
  getStats: defineProcedure({ method: 'GET', path: '/admin/cache/get-stats' })
    .input(adminCacheGetStatsInput)
    .output(adminCacheStatsDto),
  clear: defineProcedure({ method: 'POST', path: '/admin/cache/clear' })
    .input(adminCacheClearInput)
    .output(clearCacheResultDto),
}
