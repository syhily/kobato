import type { MiddlewareHandler } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

// Per-request deadline. If a handler (or downstream middleware) exceeds
// `timeoutMs`, the `AbortSignal` fires, Hono's built-in `onRequest` /
// `fetch` integration forwards the abort to in-flight `fetch()` / DB calls
// that respect `AbortSignal`, and this middleware converts the timeout
// into a clean 503.
//
// The timeout is deliberately coarse (30 s) — it is a safety net for
// stuck queries, not a SLA target. Rate-limiting and application-level
// pagination already bound normal request cost.
const DEFAULT_TIMEOUT_MS = 30_000

export function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): MiddlewareHandler<Env> {
  return async function requestTimeoutMiddleware(c, next) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    // Don't pin the event loop if this is the only pending timer.
    timer.unref()
    c.req.raw.signal.addEventListener('abort', () => controller.abort())
    try {
      await next()
    } catch (err) {
      if (controller.signal.aborted && !c.req.raw.signal.aborted) {
        throw new HTTPException(503, { message: '请求超时，请稍后再试。' })
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
