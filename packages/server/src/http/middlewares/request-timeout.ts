import type { Env } from '@kobato/server/http/hono-env'
import type { MiddlewareHandler } from 'hono'

import { localizedHttpException } from '@kobato/server/http/localized-http-exception'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const DEFAULT_TIMEOUT_MS = 30_000

export interface TimeoutOverride {
  readonly prefix: string
  readonly timeoutMs: number
}

export function requestTimeout(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  overrides: readonly TimeoutOverride[] = [],
): MiddlewareHandler<Env> {
  return async function requestTimeoutMiddleware(c, next) {
    const override = overrides.find((entry) => c.req.path.startsWith(entry.prefix))
    const effectiveTimeoutMs = override?.timeoutMs ?? timeoutMs
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs)
    timer.unref()

    const clientSignal = c.req.raw.signal
    const combined = AbortSignal.any([clientSignal, controller.signal])

    // Wrap the raw request with the combined signal; some runtimes (Vite dev)
    // reject `new Request()` on the incoming request, so fall back to a Proxy.
    try {
      unsafeCast<{ req: { raw: Request } }>(c).req.raw = new Request(c.req.raw, { signal: combined })
    } catch {
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
      if (controller.signal.aborted && !clientSignal.aborted) {
        throw localizedHttpException(503, 'error.api.timeout')
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
}
