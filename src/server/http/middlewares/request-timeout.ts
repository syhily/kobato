import type { MiddlewareHandler } from 'hono'

import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Per-request deadline: an `AbortController` merged with the client
// disconnect signal; a firing timeout surfaces as a clean 503.
const DEFAULT_TIMEOUT_MS = 30_000

export function requestTimeout(timeoutMs = DEFAULT_TIMEOUT_MS): MiddlewareHandler<Env> {
  return async function requestTimeoutMiddleware(c, next) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref()

    // Merge the timeout with the client disconnect signal — either cancels in-flight reads.
    const clientSignal = c.req.raw.signal
    const combined = AbortSignal.any([clientSignal, controller.signal])

    // Wrap the raw request with the combined signal; some runtimes (Vite dev)
    // reject `new Request()` on the incoming request, so fall back to a Proxy.
    try {
      // unsafeCast: Hono types `c.req.raw` as readonly.
      unsafeCast<{ req: { raw: Request } }>(c).req.raw = new Request(c.req.raw, { signal: combined })
    } catch {
      // Vite dev fallback: proxy forwards everything except `signal`.
      unsafeCast<{ req: { raw: Request } }>(c).req.raw = new Proxy(c.req.raw, {
        get(target, prop, receiver) {
          if (prop === 'signal') {
            return combined
          }
          const value: unknown = Reflect.get(target, prop, receiver)
          if (typeof value === 'function') {
            return unsafeCast<(...args: unknown[]) => unknown>(value).bind(target)
          }
          return value
        },
      })
    }

    try {
      await next()
    } catch (err) {
      // Only the timeout (not a client disconnect) emits the 503.
      if (controller.signal.aborted && !clientSignal.aborted) {
        throw new HTTPException(503, { message: '请求超时，请稍后再试。' })
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
