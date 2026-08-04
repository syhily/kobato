import type { Env } from '@kobato/server/http/context'
import type { RateLimitBucket, RateLimitSettings } from '@kobato/shared/config/types'

import { readBucket, tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

/**
 * Rate-limit middleware factory. Uses the client IP as the discriminator.
 *
 * Accepts either a live settings bucket key (recommended) or an explicit
 * hard-coded bucket for edge cases.
 *
 * On exceed: throws `HTTPException(429)` so the perimeter `onError`
 * renders the standard API error JSON (`{ error: { message } }`).
 *
 * Example:
 *   `authedRoute(app, contract, impl, { middleware: [rateLimitByIp('invite', 'inviteIp')] })`
 */
export function rateLimitByIp(key: string, bucketOrName: RateLimitBucket | keyof RateLimitSettings) {
  return createMiddleware<Env>(async (c, next) => {
    const bucket: RateLimitBucket = typeof bucketOrName === 'string' ? readBucket(bucketOrName) : bucketOrName
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:${key}:${c.var.requestContext.clientAddress}`, bucket)
    if (exceeded) {
      throw new HTTPException(429, { message: '请求过于频繁，请稍后再试。' })
    }
    await next()
  })
}
