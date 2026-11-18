import { imagesContract } from '@kobato/api/images.ts'
import { resolveImageRef } from '@kobato/server/domains/images/services/resolve.ts'
import { implementPublic, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'

// Contract-first: method/path/input/output live in `@kobato/api/images.ts`;
// this controller only implements the procedures. The limiter rides the
// implementer so it runs BEFORE the contract's input validation.
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
