import type { Hono } from 'hono'
import type { BlankEnv } from 'hono/types'

import { getLogger } from '@/server/infra/logger'

const leakedResponseLog = getLogger('http.leaked-response')

/**
 * Defensive wrapper around `app.fetch`: Hono's `onError` doesn't catch thrown
 * `Response`s, which RR loaders use as control flow — intercept the leak,
 * log it, and return it normally.
 */
export function wrapFetchWithLeakedResponseHandler<E extends BlankEnv>(app: Hono<E>): void {
  const originalFetch = app.fetch.bind(app)
  // Log the path only — query strings can carry one-time tokens (audit P0-9).
  const logLeaked = (request: unknown, e: Response) => {
    leakedResponseLog.warn('leaked-response', {
      path: request instanceof Request ? new URL(request.url).pathname : undefined,
      status: e.status,
      statusText: e.statusText,
    })
  }
  app.fetch = (request, env, executionContext) => {
    try {
      const result = originalFetch(request, env, executionContext)
      if (result instanceof Promise) {
        return result.catch((e) => {
          if (e instanceof Response) {
            logLeaked(request, e)
            return e
          }
          throw e
        })
      }
      return result
    } catch (e) {
      if (e instanceof Response) {
        logLeaked(request, e)
        return e
      }
      throw e
    }
  }
}
