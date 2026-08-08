import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'

import type { Env } from '@/server/http/context'
import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { readBucket, tryKeyedRateLimit } from '@/server/infra/rate-limit'

/**
 * Rate-limit middleware factory keyed on client IP. Accepts a live settings
 * bucket key or an explicit hard-coded bucket; on exceed throws
 * `HTTPException(429)` for the perimeter `onError` JSON shape.
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
