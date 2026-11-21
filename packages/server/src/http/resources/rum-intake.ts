// Same-origin browser RUM intake relay: the slim SDK posts batches here and the route
// forwards them to the verified upstream `/rum/v1/<org>/rum`. The OpenObserve endpoint
// never reaches a document; every inbound `o2-api-key` is discarded in favor of the
// provisioned token; nothing about the upstream (URL, status body, token) is reflected
// to the caller. The inbound organization segment is opaque: fail closed on the track
// shape and always forward to the organization from the verified gate entry. The body
// is relayed as decoded UTF-8 text, so a `content-encoding` other than `identity` is
// vetoed (415) instead of being corrupted on the way out. Every terminal outcome
// increments the closed-vocabulary `rum.relay.outcomes` counter, and the 429/502
// rejections carry a best-effort `Retry-After` backoff hint. In `forward` identity mode
// the relay attaches `X-Forwarded-For` + the original User-Agent; the fail-closed VRL
// pipeline still strips them upstream, and the browser only collects in `forward` mode
// after the visitor's explicit privacy consent.
// Mounted in EVERY build — the gate is read per request because a settings change
// never re-mounts the router — and exempt from the install gate, HTTP traces, and
// RUM activity by path.

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
/** The upstream answers an empty/`{"code":200}` body; cap what we buffer. */
const MAX_UPSTREAM_RESPONSE_BYTES = 64 * 1024
const UPSTREAM_TIMEOUT_MS = 5_000

/** The SDK posts `text/plain;charset=UTF-8`; allow only closed content types. */
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

  // The relay forwards the body as decoded UTF-8 text and never forwards a
  // content-encoding; a compressed batch would be corrupted on the way out.
  // Veto instead of guessing (browsers/sendBeacon never compress request
  // bodies, so this only rejects non-standard clients).
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
