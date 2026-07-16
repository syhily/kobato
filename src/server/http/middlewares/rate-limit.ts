import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'
import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { readBucket, tryKeyedRateLimit } from '@/server/infra/rate-limit'

/**
 * Rate-limit middleware factory. Uses the client IP as the discriminator.
 *
 * Accepts either a live settings bucket key (recommended) or an explicit
 * hard-coded bucket for edge cases.
 *
 * `opts.errorBody` picks the 429 wire shape. Omitted: throw
 * `HTTPException(429, 中文 message)` and let the perimeter `onError`
 * render the standard API error JSON. Provided: answer
 * `c.json(errorBody, 429)` verbatim — the public resource-route
 * convention (`{ error: 'Too many requests' }`).
 *
 * Example:
 *   `authedRoute(app, contract, impl, { middleware: [rateLimitByIp('invite', 'inviteIp')] })`
 */
export function rateLimitByIp(
  key: string,
  bucketOrName: RateLimitBucket | keyof RateLimitSettings,
  opts?: { errorBody?: unknown },
) {
  return createMiddleware<Env>(async (c, next) => {
    const bucket: RateLimitBucket = typeof bucketOrName === 'string' ? readBucket(bucketOrName) : bucketOrName
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:${key}:${c.var.clientAddress}`, bucket)
    if (exceeded) {
      if (opts?.errorBody !== undefined) {
        return c.json(opts.errorBody, 429)
      }
      throw new HTTPException(429, { message: '请求过于频繁，请稍后再试。' })
    }
    await next()
  })
}
