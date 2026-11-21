import type { Env } from '@kobato/server/http/hono-env'

import { getLogger } from '@kobato/server/infra/logger'
import { OBSERVABILITY_ORGANIZATION_PATTERN } from '@kobato/server/infra/observability'
import { tryRumIntakeRateLimit } from '@kobato/server/infra/rate-limit'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { activeFrontendRelay } from '@kobato/server/infra/trace/config'
import { recordRumRelayOutcome } from '@kobato/server/infra/trace/metrics'
import { RUM_INTAKE_PATH } from '@kobato/telemetry/rum'
import { Hono } from 'hono'

const log = getLogger('rum.intake')

const RATE_LIMIT_RETRY_AFTER_SECONDS = 60
const UPSTREAM_FAILURE_RETRY_AFTER_SECONDS = 5

const RUM_TRACK_PATTERN = /^\/rum\/v1\/([^/]+)\/rum$/

const MAX_BATCH_BYTES = 1024 * 1024
const MAX_QUERY_BYTES = 4096
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024
const UPSTREAM_TIMEOUT_MS = 5_000

function relayContentType(raw: string | undefined): string {
  if (raw === undefined) {
    return 'text/plain;charset=UTF-8'
  }
  const mediaType = raw.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json' ? 'application/json' : 'text/plain;charset=UTF-8'
}

async function readBatchBody(raw: Request): Promise<{ body: string; oversized: boolean }> {
  const stream = raw.body
  if (stream === null) {
    return { body: '', oversized: false }
  }
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      received += value.byteLength
      if (received > MAX_BATCH_BYTES) {
        try {
          await reader.cancel()
        } catch {}
        return { body: '', oversized: true }
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }
  chunks.push(decoder.decode())
  return { body: chunks.join(''), oversized: false }
}

export const rumIntakeRouter = new Hono<Env>().post(`${RUM_INTAKE_PATH}/*`, async (c) => {
  c.header('Cache-Control', 'no-store')

  const relay = activeFrontendRelay()
  if (relay === null) {
    return c.json({ error: { message: 'RUM intake is disabled' } }, 404)
  }

  const subPath = c.req.path.slice(RUM_INTAKE_PATH.length)
  const track = RUM_TRACK_PATTERN.exec(subPath)
  if (track === null || !OBSERVABILITY_ORGANIZATION_PATTERN.test(track[1]!)) {
    return c.json({ error: { message: 'Unknown RUM intake track' } }, 404)
  }

  const rawQuery = c.req.url.split('?', 2)[1] ?? ''
  if (rawQuery.length > MAX_QUERY_BYTES) {
    return c.json({ error: { message: 'Query too long' } }, 414)
  }

  const declared = Number(c.req.header('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_BATCH_BYTES) {
    recordRumRelayOutcome('oversized')
    return c.json({ error: { message: 'Batch too large' } }, 413)
  }

  const contentEncoding = c.req.header('content-encoding')
  if (contentEncoding !== undefined && contentEncoding.trim().toLowerCase() !== 'identity') {
    return c.json({ error: { message: 'Compressed RUM batches are not accepted' } }, 415)
  }

  const limited = await tryRumIntakeRateLimit(c.var.requestContext.clientAddress)
  if (limited.exceeded) {
    recordRumRelayOutcome('rate_limited')
    c.header('Retry-After', String(RATE_LIMIT_RETRY_AFTER_SECONDS))
    return c.json({ error: { message: 'Too many requests' } }, 429)
  }

  const { body, oversized } = await readBatchBody(c.req.raw)
  if (oversized) {
    recordRumRelayOutcome('oversized')
    return c.json({ error: { message: 'Batch too large' } }, 413)
  }

  const parameters = new URLSearchParams(rawQuery)
  parameters.delete('o2-api-key')
  parameters.append('o2-api-key', relay.clientToken)

  const headers: Record<string, string> = { 'content-type': relayContentType(c.req.header('content-type')) }
  if (relay.clientIdentity === 'forward') {
    headers['x-forwarded-for'] = c.var.requestContext.clientAddress
    const userAgent = c.req.header('user-agent')
    if (userAgent !== undefined) {
      headers['user-agent'] = userAgent
    }
  }

  const result = await safeFetch(`${relay.endpoint}/rum/v1/${relay.organization}/rum?${parameters.toString()}`, {
    method: 'POST',
    headers,
    body,
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    maxBytes: MAX_UPSTREAM_RESPONSE_BYTES,
    maxRedirects: 0,
    trustedOrigin: relay.endpoint,
    operation: 'observability.rum.relay',
  })
  if (!result.ok) {
    log.warn('OpenObserve RUM relay failed', { reason: result.reason, status: result.status })
    recordRumRelayOutcome('upstream_error')
    c.header('Retry-After', String(UPSTREAM_FAILURE_RETRY_AFTER_SECONDS))
    return c.json({ error: { message: 'RUM relay failed' } }, 502)
  }
  recordRumRelayOutcome('ok')
  return c.body(null, 202)
})
