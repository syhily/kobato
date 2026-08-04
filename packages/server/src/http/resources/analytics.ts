import type { Env } from '@kobato/server/http/context'

import { getAnalyticsReader } from '@kobato/server/bootstrap/analytics-lifecycle'
import {
  acquireRealtimeConnection,
  queryRealtimeTail,
  realtimeConnectionKey,
} from '@kobato/server/domains/analytics/services/realtime'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac'
import { getLogger } from '@kobato/server/infra/logger'
import { Hono } from 'hono'

const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 25_000

export const analyticsEventsRouter = new Hono<Env>().get('/api/analytics/events', requireRoleMw('admin'), async (c) => {
  const sinceParam = c.req.query('since')
  let lastSeen = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)
  if (Number.isNaN(lastSeen.getTime())) {
    lastSeen = new Date(Date.now() - 60_000)
  }

  // The connection registry and the per-session cap live in the analytics
  // domain; this resource keeps only the SSE/Hono plumbing.
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
              const ordered = [...rows].reverse()
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
      // Some runtimes (and in-process fetch) cancel the response body
      // instead of aborting the request signal. Release through the same
      // close path or the session's registry slot and both interval
      // timers leak until the next failed enqueue (up to the 25s
      // heartbeat — and forever when the stream stays silent).
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
