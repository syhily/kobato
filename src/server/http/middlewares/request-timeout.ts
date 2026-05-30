import type { MiddlewareHandler } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

// Per-request deadline. Creates an `AbortController` whose signal is
// forwarded to `c.req.raw.signal` via `AbortSignal.any()`. When the
// timeout fires, any in-flight `fetch()` / DB call that respects
// `AbortSignal` is cancelled immediately, and this middleware converts
// the abort into a clean 503.
const DEFAULT_TIMEOUT_MS = 30_000

export function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): MiddlewareHandler<Env> {
  return async function requestTimeoutMiddleware(c, next) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref()

    // Merge our timeout signal with the client disconnect signal so
    // handlers and downstream calls (pg queries, fetch, etc.) that
    // read `c.req.raw.signal` are cancelled when either fires.
    const combined = AbortSignal.any([c.req.raw.signal, controller.signal])

    // Override the request's signal so `c.req.raw.signal` carries the
    // combined abort. We replace the getter rather than mutating the
    // frozen `Request` — Hono reads `c.req.raw.signal` each time.
    const originalRaw = c.req.raw
    Object.defineProperty(c.req, 'raw', {
      get() {
        return new Proxy(originalRaw, {
          get(target, prop) {
            if (prop === 'signal') {
              return combined
            }
            return Reflect.get(target, prop)
          },
        })
      },
      configurable: true,
    })

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
