import type { RumIntakeOutput } from '@kobato/api/contracts/public/observability'

import { publicObservabilityContract } from '@kobato/api/rpc/public/observability'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { getLogger } from '@kobato/server/infra/logger'
import { OBSERVABILITY_ORGANIZATION_PATTERN } from '@kobato/server/infra/observability'
import { tryRumIntakeRateLimit } from '@kobato/server/infra/rate-limit'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { activeFrontendRum, activeFrontendRelay } from '@kobato/server/infra/trace/config'
import { recordRumRelayOutcome } from '@kobato/server/infra/trace/metrics'

const log = getLogger('rum.intake')

const RATE_LIMIT_RETRY_AFTER_SECONDS = 60
const UPSTREAM_FAILURE_RETRY_AFTER_SECONDS = 5

const RUM_TRACK_PATTERN = /^\/rum\/v1\/([^/]+)\/rum$/

const MAX_BATCH_BYTES = 1024 * 1024
const MAX_QUERY_BYTES = 4096
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024
const UPSTREAM_TIMEOUT_MS = 5_000

function relayContentType(contentType: string | null): string {
  if (contentType === null) {
    return 'text/plain;charset=UTF-8'
  }
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json' ? 'application/json' : 'text/plain;charset=UTF-8'
}

function intakeError(
  status: 404 | 413 | 414 | 429 | 502,
  message: string,
  retryAfterSeconds?: number,
): RumIntakeOutput {
  return { kind: 'error', status, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) }
}

const rumStatus = implementPublic(publicObservabilityContract).rumStatus.handler(({ context }) => {
  context.responseHeaders.set('Cache-Control', 'no-store')
  return { enabled: activeFrontendRum() !== null }
})

const rumIntake = implementPublic(publicObservabilityContract).rumIntake.handler(
  async ({ input, context }): Promise<RumIntakeOutput> => {
    const relay = activeFrontendRelay()
    if (relay === null) {
      return intakeError(404, 'RUM intake is disabled')
    }

    const track = RUM_TRACK_PATTERN.exec(input.track)
    if (track === null || !OBSERVABILITY_ORGANIZATION_PATTERN.test(track[1]!)) {
      return intakeError(404, 'Unknown RUM intake track')
    }

    if (input.query.length > MAX_QUERY_BYTES) {
      return intakeError(414, 'Query too long')
    }

    if (input.body.length > MAX_BATCH_BYTES) {
      recordRumRelayOutcome('oversized')
      return intakeError(413, 'Batch too large')
    }

    const limited = await tryRumIntakeRateLimit(context.clientAddress)
    if (limited.exceeded) {
      recordRumRelayOutcome('rate_limited')
      return intakeError(429, 'Too many requests', RATE_LIMIT_RETRY_AFTER_SECONDS)
    }

    const parameters = new URLSearchParams(input.query)
    parameters.delete('o2-api-key')
    parameters.append('o2-api-key', relay.clientToken)

    const headers: Record<string, string> = { 'content-type': relayContentType(input.contentType) }
    if (relay.clientIdentity === 'forward') {
      headers['x-forwarded-for'] = context.clientAddress
      if (context.requestFacts.userAgent !== null) {
        headers['user-agent'] = context.requestFacts.userAgent
      }
    }

    const result = await safeFetch(`${relay.endpoint}/rum/v1/${relay.organization}/rum?${parameters.toString()}`, {
      method: 'POST',
      headers,
      body: input.body,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      maxBytes: MAX_UPSTREAM_RESPONSE_BYTES,
      maxRedirects: 0,
      trustedOrigin: relay.endpoint,
      operation: 'observability.rum.relay',
    })
    if (!result.ok) {
      log.warn('OpenObserve RUM relay failed', { reason: result.reason, status: result.status })
      recordRumRelayOutcome('upstream_error')
      return intakeError(502, 'RUM relay failed', UPSTREAM_FAILURE_RETRY_AFTER_SECONDS)
    }
    recordRumRelayOutcome('ok')
    return { kind: 'accepted' }
  },
)

export const publicObservabilityRouter = implementPublic(publicObservabilityContract).router({
  rumStatus,
  rumIntake,
})
