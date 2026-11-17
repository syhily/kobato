import {
  decreaseLikes,
  increaseLikes,
  queryLikes,
  validateLikeToken,
} from '@kobato/server/domains/comments/services/likes.ts'
import { resolveMetricTarget, safeResolveMetricTarget } from '@kobato/server/domains/comments/services/shared.ts'
import { localizedOrpcError, publicProc } from '@kobato/server/http/orpc-base.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { tryLikeIncreaseRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { z } from 'zod'

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
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'likes.error.rateLimited')
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
    const consumed = await decreaseLikes(context.db, target, input.token)
    if (!consumed) {
      // Unknown/consumed/purged token — 200 with the current count would be a lie the client persists.
      throw new DomainError('BAD_REQUEST', descriptorFor('likes.error.stale'))
    }
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
