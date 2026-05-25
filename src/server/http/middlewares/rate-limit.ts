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
 * Example:
 *   `authedRoute(app, contract, impl, { middleware: [rateLimitByIp('invite', 'inviteIp')] })`
 */
export function rateLimitByIp(key: string, bucketOrName: RateLimitBucket | keyof RateLimitSettings) {
  const bucket: RateLimitBucket = typeof bucketOrName === 'string' ? readBucket(bucketOrName) : bucketOrName
  return createMiddleware<Env>(async (c, next) => {
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:${key}:${c.var.clientAddress}`, bucket)
    if (exceeded) {
      throw new HTTPException(429, { message: '请求过于频繁，请稍后再试。' })
    }
    await next()
  })
}
