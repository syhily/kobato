import type { Hono } from 'hono'
import type { BlankEnv } from 'hono/types'

import { getLogger } from '@/server/infra/logger'

const leakedResponseLog = getLogger('http.leaked-response')

/**
 * Defensive wrapper around `app.fetch`.
 *
 * Hono's `app.onError` does not catch thrown Response objects (only Error
 * instances). React Router loaders/actions throw Response/redirect() as
 * control flow, and in rare edge cases (streaming deferred boundaries,
 * middleware ordering bugs, or react-router-hono-server internal leakage)
 * the Response can bubble past Hono's error handler and crash the dev server
 * with "Unknown error: [object Response]".
 *
 * Wrapping `app.fetch` lets us intercept the leaked Response, log it for
 * diagnostics, and return it normally.
 */
export function wrapFetchWithLeakedResponseHandler<E extends BlankEnv>(app: Hono<E>): void {
  const originalFetch = app.fetch.bind(app)
  // Log the path only — the query string can carry one-time secrets
  // (signin magic-link / reset tokens), which must never reach the log
  // aggregation pipeline (audit P0-9).
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
