import {
  decreaseLikes,
  increaseLikes,
  queryLikes,
  validateLikeToken,
} from '@kobato/server/domains/comments/services/likes'
import { resolveMetricTarget, safeResolveMetricTarget } from '@kobato/server/domains/comments/services/shared'
import { frontendKeyAuth, publicProc } from '@kobato/server/http/orpc-base'
import { DomainError } from '@kobato/server/infra/http/errors'
import { tryLikeIncreaseRateLimit } from '@kobato/server/infra/rate-limit'
import { ORPCError } from '@orpc/server'
import { z } from 'zod'

// Like writes ride the frontend proxy chain: `frontendKeyAuth` runs first
// so the like-rate bucket counts the visitor address forwarded behind a
// valid key (anonymous requests keep the transport's own address — the
// proxy's — exactly like the comment path).
const increaseLike = publicProc
  .route({ method: 'POST', path: '/content/v1/likes/increase' })
  .input(z.object({ key: z.string() }))
  .output(
    z.object({
      key: z.string(),
      likes: z.number().int().nonnegative(),
      token: z.string().optional(),
    }),
  )
  .use(frontendKeyAuth)
  .handler(async ({ input, context }) => {
    const limit = await tryLikeIncreaseRateLimit(context.clientAddress)
    if (limit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '点赞过于频繁，请稍后再试。' })
    }
    const target = await resolveMetricTarget(context.db, input.key)
    return { ...(await increaseLikes(context.db, target)), key: input.key }
  })

const decreaseLike = publicProc
  .route({ method: 'POST', path: '/content/v1/likes/decrease' })
  .input(z.object({ key: z.string(), token: z.string() }))
  .output(z.object({ key: z.string(), likes: z.number().int().nonnegative() }))
  .use(frontendKeyAuth)
  .handler(async ({ input, context }) => {
    const target = await resolveMetricTarget(context.db, input.key)
    const consumed = await decreaseLikes(context.db, target, input.token)
    if (!consumed) {
      // Unknown / already-consumed / purged token: the count did NOT
      // change, so a 200 carrying the current count would tell the
      // client a lie it would persist as truth.
      throw new DomainError('BAD_REQUEST', '点赞状态已失效，请刷新页面后重试')
    }
    return { key: input.key, likes: await queryLikes(context.db, target) }
  })

const validateLike = publicProc
  .route({ method: 'GET', path: '/content/v1/likes/validate' })
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
