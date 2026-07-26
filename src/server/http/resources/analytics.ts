import type { Context } from 'hono'

import { Hono } from 'hono'
import { createHash } from 'node:crypto'

import type { Env } from '@/server/http/context'

import { queryRealtimeTail } from '@/server/domains/analytics/services/realtime'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'

const POLL_INTERVAL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 25_000
const MAX_CONNECTIONS_PER_SESSION = 2

// Per-session connection counter. Node.js is single-threaded, so a plain
// Map is safe. If worker threads are ever introduced, this state must move
// to the main thread only.
const activeSSEConnections = new Map<string, number>()

function getRealtimeKey(c: Context<Env>): string {
  const sessionId = c.var.requestContext.session.id
  if (sessionId) {
    return `session:${sessionId}`
  }
  return `ip:${hashClientAddress(c.var.requestContext.clientAddress)}`
}

function hashClientAddress(address: string): string {
  return createHash('sha256').update(address).digest('hex').slice(0, 32)
}

function incrementSession(sessionId: string): void {
  activeSSEConnections.set(sessionId, (activeSSEConnections.get(sessionId) ?? 0) + 1)
}

function decrementSession(sessionId: string): void {
  const current = (activeSSEConnections.get(sessionId) ?? 0) - 1
  if (current <= 0) {
    activeSSEConnections.delete(sessionId)
  } else {
    activeSSEConnections.set(sessionId, current)
  }
}

export const analyticsEventsRouter = new Hono<Env>().get('/api/analytics/events', requireRoleMw('admin'), async (c) => {
  const sinceParam = c.req.query('since')
  let lastSeen = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)
  if (Number.isNaN(lastSeen.getTime())) {
    lastSeen = new Date(Date.now() - 60_000)
  }

  const sessionId = getRealtimeKey(c)
  const current = activeSSEConnections.get(sessionId) ?? 0
  if (current >= MAX_CONNECTIONS_PER_SESSION) {
    return c.json({ error: 'Too many realtime connections for this session' }, 429)
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      incrementSession(sessionId)
      let closed = false
      let pollInProgress = false

      const close = () => {
        if (closed) {
          return
        }
        closed = true
        decrementSession(sessionId)
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
            const rows = await queryRealtimeTail(c.var.requestContext.db, lastSeen)
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
