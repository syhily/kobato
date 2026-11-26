import { likesContract } from '@kobato/api/rpc/public/likes'
import {
  decreaseLikes,
  increaseLikes,
  queryLikes,
  validateLikeToken,
} from '@kobato/server/domains/comments/services/likes'
import { resolveMetricTarget, safeResolveMetricTarget } from '@kobato/server/domains/comments/services/shared'
import { implementPublic, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { tryLikeIncreaseRateLimit } from '@kobato/server/infra/rate-limit'

const impl = implementPublic(likesContract)

const increaseLike = impl.increase.handler(async ({ input, context }) => {
  const limit = await tryLikeIncreaseRateLimit(context.clientAddress)
  if (limit.exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'likes.error.rateLimited')
  }
  const target = await resolveMetricTarget(context.db, input.key)
  return { ...(await increaseLikes(context.db, target)), key: input.key }
})

const decreaseLike = impl.decrease.handler(async ({ input, context }) => {
  const target = await resolveMetricTarget(context.db, input.key)
  const consumed = await decreaseLikes(context.db, target, input.token)
  if (!consumed) {
    throw new DomainError('BAD_REQUEST', descriptorFor('likes.error.stale'))
  }
  return { key: input.key, likes: await queryLikes(context.db, target) }
})

const validateLike = impl.validate.handler(async ({ input, context }) => {
  const target = await safeResolveMetricTarget(context.db, input.key)
  if (target === null) {
    return { key: input.key, valid: false }
  }
  return { key: input.key, valid: await validateLikeToken(context.db, target, input.token) }
})

export const likesRouter = impl.router({
  increase: increaseLike,
  decrease: decreaseLike,
  validate: validateLike,
})
