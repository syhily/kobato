import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { queryRealtimeTail } from '@/server/domains/analytics/query'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'

const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 25_000
const MAX_SSE_CONNECTIONS = 10
let activeSSEConnections = 0

export const analyticsEventsRouter = new Hono<Env>().get('/api/analytics/events', requireRoleMw('admin'), async (c) => {
  const sinceParam = c.req.query('since')
  let lastSeen = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)
  if (Number.isNaN(lastSeen.getTime())) {
    lastSeen = new Date(Date.now() - 60_000)
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (activeSSEConnections >= MAX_SSE_CONNECTIONS) {
        controller.error(new Error('Too many concurrent SSE connections'))
        return
      }
      activeSSEConnections++
      let closed = false
      let pollInProgress = false

      const close = () => {
        if (closed) {
          return
        }
        closed = true
        activeSSEConnections--
        clearInterval(pollTimer)
        clearInterval(heartbeatTimer)
        c.req.raw.signal.removeEventListener('abort', close)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

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
            const rows = await queryRealtimeTail(lastSeen)
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
  })

  return c.body(stream, 200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
})
