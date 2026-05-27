import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { decreaseLikes, increaseLikes, queryLikes, validateLikeToken } from '@/server/domains/comments/likes'
import { resolveMetricTarget, safeResolveMetricTarget } from '@/server/domains/comments/services/shared'
import { publicProc } from '@/server/http/orpc-base'
import { tryLikeIncreaseRateLimit } from '@/server/infra/rate-limit'

const increaseLike = publicProc
  .route({ method: 'POST', path: '/likes/increase' })
  .input(z.object({ key: z.string() }))
  .output(
    z.object({
      key: z.string(),
      likes: z.number().int().nonnegative(),
      token: z.string().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const limit = await tryLikeIncreaseRateLimit(context.clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '点赞过于频繁，请稍后再试。' })
    }
    const target = await resolveMetricTarget(context.db, input.key)
    return { ...(await increaseLikes(context.db, target)), key: input.key }
  })

const decreaseLike = publicProc
  .route({ method: 'POST', path: '/likes/decrease' })
  .input(z.object({ key: z.string(), token: z.string() }))
  .output(z.object({ key: z.string(), likes: z.number().int().nonnegative() }))
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.key)
    await decreaseLikes(context.db, target, input.token)
    return { key: input.key, likes: await queryLikes(context.db, target) }
  })

const validateLike = publicProc
  .route({ method: 'GET', path: '/likes/validate' })
  .input(z.object({ key: z.string(), token: z.string() }))
  .output(z.object({ key: z.string(), valid: z.boolean() }))
  .handler(async ({ input, context }) => {
    const target = await safeResolveMetricTarget(context.db, input.key)
    if (target === null) {
      return { key: input.key, valid: false }
    }
    return { key: input.key, valid: await validateLikeToken(context.db, target, input.token) }
  })

export const likesRouter = {
  increase: increaseLike,
  decrease: decreaseLike,
  validate: validateLike,
}
