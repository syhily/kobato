import type { Env } from '@kobato/server/http/hono-env'
import type { RateLimitBucket, RateLimitSettings } from '@kobato/settings/types'
import type { Context } from 'hono'

import { localizedHttpException } from '@kobato/server/http/localized-http-exception'
import { readBucket, tryKeyedRateLimit } from '@kobato/server/infra/rate-limit'
import { createMiddleware } from 'hono/factory'

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
