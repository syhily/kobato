import type { Context } from 'hono'

import { createMiddleware } from 'hono/factory'

import type { Env } from '@/server/http/context'
import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { localizedHttpException } from '@/server/http/localized-http-exception'
import { readBucket, tryKeyedRateLimit } from '@/server/infra/rate-limit'

/** Rate-limit middleware keyed on client IP; accepts a live settings bucket key or an
 *  explicit bucket. On exceed throws a localized 429 for the perimeter `onError` shape. */
export function rateLimitByIp(key: string, bucketOrName: RateLimitBucket | keyof RateLimitSettings) {
  return createMiddleware<Env>(async (c, next) => {
    const bucket: RateLimitBucket = typeof bucketOrName === 'string' ? readBucket(bucketOrName) : bucketOrName
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:${key}:${c.var.requestContext.clientAddress}`, bucket)
    if (exceeded) {
      throw localizedHttpException(429, 'error.api.rateLimited')
    }
    await next()
  })
}

export function rateLimitByRequestKey(key: string, bucket: RateLimitBucket, requestKey: (c: Context<Env>) => string) {
  return createMiddleware<Env>(async (c, next) => {
    const { exceeded } = await tryKeyedRateLimit(`rate-limit:${key}:${requestKey(c)}`, bucket)
    if (exceeded) {
      throw localizedHttpException(429, 'error.api.rateLimited')
    }
    await next()
  })
}
