import { z } from 'zod'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { adminProc } from '@/server/http/orpc-base'
import { clearAdminCache, getAdminCacheStats } from '@/server/infra/redis/admin-ops'
import { adminCacheStatsDto, clearCacheResultDto } from '@/shared/contracts/cache'
import { CACHE_BUCKET_IDS } from '@/shared/types/cache'
const getStats = adminProc
  .route({ method: 'GET', path: '/admin/cache/get-stats' })
  .input(z.object({}))
  .output(adminCacheStatsDto)
  .handler(() => getAdminCacheStats())

const clear = adminProc
  .route({ method: 'POST', path: '/admin/cache/clear' })
  .input(z.object({ target: z.union([z.enum(CACHE_BUCKET_IDS), z.literal('all')]) }))
  .output(clearCacheResultDto)
  .handler(async ({ input, context }) => {
    const result = await clearAdminCache(input.target)
    recordAuditEventFromContext(context, {
      action: 'cache_cleared',
      resourceType: 'cache',
      details: { target: input.target },
    })
    return result
  })

export const adminCacheRouter = { getStats, clear }
