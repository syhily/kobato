import { Hono, type Context } from 'hono'

import type { Env } from '@/server/http/context'
import type { RealtimeEvent } from '@/shared/contracts/analytics'

import { getAnalyticsReader } from '@/server/bootstrap/analytics-lifecycle'
import { pushDeviceEnvBeacon } from '@/server/domains/analytics/services/env-beacon'
import {
  acquireRealtimeConnection,
  queryRealtimeTail,
  realtimeConnectionKey,
} from '@/server/domains/analytics/services/realtime'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { tryDeviceEnvBeaconRateLimit } from '@/server/infra/rate-limit'
import { deviceEnvBeaconSchema } from '@/shared/contracts/analytics'

const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 25_000

/** A beacon is < 1 KB in practice; anything past this is not a beacon. */
const MAX_BEACON_BYTES = 4 * 1024

function tooLarge(c: Context<Env>) {
  return c.json({ error: { message: 'Payload too large' } }, 413)
}

export const analyticsEventsRouter = new Hono<Env>()
  .get('/api/analytics/events', requireRoleMw('admin'), async (c) => {
    const sinceParam = c.req.query('since')
    let lastSeen = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)
    if (Number.isNaN(lastSeen.getTime())) {
      lastSeen = new Date(Date.now() - 60_000)
    }

    // The connection registry + per-session cap live in the analytics domain; this keeps only the SSE plumbing.
    const connectionKey = realtimeConnectionKey(c.var.requestContext.session.id, c.var.requestContext.clientAddress)
    const releaseConnection = acquireRealtimeConnection(connectionKey)
    if (releaseConnection === null) {
      return c.json({ error: { message: 'Too many realtime connections for this session' } }, 429)
    }

    const encoder = new TextEncoder()
    let closeStream!: () => void
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        let pollInProgress = false

        const close = () => {
          if (closed) {
            return
          }
          closed = true
          releaseConnection()
          clearInterval(pollTimer)
          clearInterval(heartbeatTimer)
          c.req.raw.signal.removeEventListener('abort', close)
          try {
            controller.close()
          } catch {
            /* already closed */
          }
        }
        closeStream = close

        c.req.raw.signal.addEventListener('abort', close)

        const send = (eventName: string, data: unknown) => {
          if (closed) {
            return
          }
          try {
            controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`))
          } catch {
            close()
          }
        }

        try {
          controller.enqueue(encoder.encode(': hello\n\n'))
        } catch {
          close()
          return
        }

        const pollTimer = setInterval(() => {
          if (pollInProgress || closed) {
            return
          }
          pollInProgress = true
          void (async () => {
            try {
              const rows = await queryRealtimeTail(getAnalyticsReader(), lastSeen)
              if (rows.length > 0) {
                // ES2022 lib has no toReversed — build the reversed copy by hand.
                const ordered: RealtimeEvent[] = []
                for (let i = rows.length - 1; i >= 0; i -= 1) {
                  ordered.push(rows[i]!)
                }
                lastSeen = new Date(ordered[ordered.length - 1]!.ts)
                send('events', ordered)
              }
            } catch (err) {
              getLogger('analytics.sse').warn('queryRealtimeTail failed', {
                error: err instanceof Error ? err.message : String(err),
              })
            } finally {
              pollInProgress = false
            }
          })()
        }, POLL_INTERVAL_MS)

        const heartbeatTimer = setInterval(() => {
          if (closed) {
            return
          }
          try {
            controller.enqueue(encoder.encode(': keep-alive\n\n'))
          } catch {
            close()
          }
        }, HEARTBEAT_INTERVAL_MS)
      },
      cancel() {
        // Some runtimes cancel the body instead of aborting the signal — release
        // through the same close path or the registry slot and timers leak.
        closeStream?.()
      },
    })

    return c.body(stream, 200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
  })
  // Client device-environment beacon: anonymous, fire-and-forget
  // (`navigator.sendBeacon`). The event id is NOT validated against the main
  // table — a bot-gated id yields an orphan sidecar row that the queries'
  // JOIN drops and retention clears.
  .post('/api/analytics/env', async (c) => {
    // Check the declared length first: never read an unbounded body.
    const declared = Number(c.req.header('content-length') ?? Number.NaN)
    if (Number.isFinite(declared) && declared > MAX_BEACON_BYTES) {
      return tooLarge(c)
    }

    const limited = await tryDeviceEnvBeaconRateLimit(c.var.requestContext.clientAddress)
    if (limited.exceeded) {
      return c.json({ error: { message: 'Too many requests' } }, 429)
    }

    const body = await c.req.text()
    // Chunked / length-less requests get the same cap after the read.
    if (new TextEncoder().encode(body).byteLength > MAX_BEACON_BYTES) {
      return tooLarge(c)
    }

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return c.json({ error: { message: 'Invalid JSON' } }, 400)
    }
    const parsed = deviceEnvBeaconSchema.safeParse(payload)
    if (!parsed.success) {
      return c.json({ error: { message: 'Invalid beacon' } }, 400)
    }

    pushDeviceEnvBeacon(parsed.data)
    return c.body(null, 204)
  })
