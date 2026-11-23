import { publicAnalyticsContract } from '@kobato/api/rpc/public/analytics'
import { pushDeviceEnvBeacon } from '@kobato/server/domains/analytics/services/env-beacon'
import { implementPublic, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { tryDeviceEnvBeaconRateLimit } from '@kobato/server/infra/rate-limit'

const impl = implementPublic(publicAnalyticsContract).use(async ({ context, next }) => {
  const limited = await tryDeviceEnvBeaconRateLimit(context.clientAddress)
  if (limited.exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'error.api.rateLimited')
  }
  return next({})
})

const recordDeviceEnv = impl.recordDeviceEnv.handler(({ input }) => {
  pushDeviceEnvBeacon(input)
  return { accepted: true as const }
})

export const publicAnalyticsRouter = impl.router({ recordDeviceEnv })
