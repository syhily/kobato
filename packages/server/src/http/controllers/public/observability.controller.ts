import { publicObservabilityContract } from '@kobato/api/rpc/public/observability'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { activeFrontendRum } from '@kobato/server/infra/trace/config'

const impl = implementPublic(publicObservabilityContract)

const rumStatus = impl.rumStatus.handler(({ context }) => {
  context.responseHeaders.set('Cache-Control', 'no-store')
  return { enabled: activeFrontendRum() !== null }
})

export const publicObservabilityRouter = impl.router({ rumStatus })
