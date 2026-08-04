import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { adminProc } from '@kobato/server/http/orpc-base'
import { clearAdminCache, getAdminCacheStats } from '@kobato/server/infra/cache/admin-ops'
import { adminCacheStatsDto, clearCacheResultDto } from '@kobato/shared/contracts/cache'
import { CACHE_BUCKET_IDS } from '@kobato/shared/types/cache'
import { z } from 'zod'
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
