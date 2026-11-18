import { adminCacheContract } from '@kobato/api/admin/cache.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { implementAdmin } from '@kobato/server/http/orpc-base.ts'
import { clearAdminCache, getAdminCacheStats } from '@kobato/server/infra/cache/admin-ops.ts'

// Contract-first: method/path/input/output live in
// `@kobato/api/admin/cache.ts`; this controller only implements the
// procedures (admin base).
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
