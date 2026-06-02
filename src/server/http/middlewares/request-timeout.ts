import type { MiddlewareHandler } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

// Per-request deadline. Creates an `AbortController` whose signal is
// merged with the client disconnect signal via `AbortSignal.any()`. The
// combined signal is injected into the request by wrapping it in a new
// `Request` — no Proxy needed. When the timeout fires, any in-flight
// `fetch()` / DB call that respects `AbortSignal` is cancelled
// immediately, and this middleware converts the abort into a clean 503.
const DEFAULT_TIMEOUT_MS = 30_000

export function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): MiddlewareHandler<Env> {
  return async function requestTimeoutMiddleware(c, next) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref()

    // Merge our timeout signal with the client disconnect signal so
    // handlers and downstream calls (pg queries, fetch, etc.) that
    // read `c.req.raw.signal` are cancelled when either fires.
    const clientSignal = c.req.raw.signal
    const combined = AbortSignal.any([clientSignal, controller.signal])

    // Replace the raw request with a wrapper that carries the combined
    // signal. We try `new Request()` first (standard semantics), but some
    // runtimes — e.g. @hono/node-server in Vite dev mode — provide a
    // Request class whose internal private fields are invisible to the
    // global undici Request constructor, causing a TypeError. In that
    // case we fall back to a Proxy.
    try {
      c.req.raw = new Request(c.req.raw, { signal: combined })
    } catch {
      c.req.raw = new Proxy(c.req.raw, {
        get(target, prop, receiver) {
          if (prop === 'signal') {
            return combined
          }
          const value = Reflect.get(target, prop, receiver)
          if (typeof value === 'function') {
            return value.bind(target)
          }
          return value
        },
      })
    }

    try {
      await next()
    } catch (err) {
      // Distinguish a timeout (our controller fired) from a client
      // disconnect (the original signal fired) so we only emit 503
      // for the timeout case.
      if (controller.signal.aborted && !clientSignal.aborted) {
        throw new HTTPException(503, { message: '请求超时，请稍后再试。' })
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
