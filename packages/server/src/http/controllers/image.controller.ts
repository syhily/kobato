import { imagesContract } from '@kobato/api/rpc/images'
import { resolveImageRef } from '@kobato/server/domains/images/services/resolve'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base'

const impl = implementPublic(imagesContract).use(resourceRateLimit)

const resolveThumbhash = impl.resolveThumbhash.handler(async ({ input, context }) => {
  const image = await resolveImageRef(context.db, input.src)
  return {
    thumbhash: image?.thumbhash ?? null,
    width: image?.width ?? null,
    height: image?.height ?? null,
  }
})

export const imageRouter = impl.router({
  resolveThumbhash,
})
