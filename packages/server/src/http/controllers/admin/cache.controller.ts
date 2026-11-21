import { adminCacheContract } from '@kobato/api/admin/cache'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { implementAdmin } from '@kobato/server/http/orpc-base'
import { clearAdminCache, getAdminCacheStats } from '@kobato/server/infra/cache/admin-ops'

const impl = implementAdmin(adminCacheContract)

const getStats = impl.getStats.handler(({ context }) => getAdminCacheStats(context.db))

const clear = impl.clear.handler(async ({ input, context }) => {
  const result = await clearAdminCache(context.db, input.target)
  recordAuditEventFromContext(context, {
    action: 'cache_cleared',
    resourceType: 'cache',
    details: { target: input.target },
  })
  return result
})

export const adminCacheRouter = impl.router({ getStats, clear })
