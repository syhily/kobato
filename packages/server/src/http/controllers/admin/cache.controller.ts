import { adminCacheStatsDto, clearCacheResultDto } from '@kobato/shared/contracts/cache.ts'
import { CACHE_BUCKET_IDS } from '@kobato/shared/types/cache.ts'
import { z } from 'zod'

import { recordAuditEventFromContext } from '../../../domains/audit/services/record'
import { clearAdminCache, getAdminCacheStats } from '../../../infra/cache/admin-ops'
import { adminProc } from '../../orpc-base'
const getStats = adminProc
  .route({ method: 'GET', path: '/admin/cache/get-stats' })
  .input(z.object({}))
  .output(adminCacheStatsDto)
  .handler(({ context }) => getAdminCacheStats(context.db))

const clear = adminProc
  .route({ method: 'POST', path: '/admin/cache/clear' })
  .input(z.object({ target: z.union([z.enum(CACHE_BUCKET_IDS), z.literal('all')]) }))
  .output(clearCacheResultDto)
  .handler(async ({ input, context }) => {
    const result = await clearAdminCache(context.db, input.target)
    recordAuditEventFromContext(context, {
      action: 'cache_cleared',
      resourceType: 'cache',
      details: { target: input.target },
    })
    return result
  })

export const adminCacheRouter = { getStats, clear }
