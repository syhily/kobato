import type { WebmentionReceiveOutput } from '@kobato/api/contracts/public/webmentions'

import { webmentionsContract } from '@kobato/api/rpc/public/webmentions'
import { resolveMetricTarget } from '@kobato/server/domains/comments/services/shared'
import { enqueueWebmention } from '@kobato/server/domains/webmentions/inbox-enqueue'
import { webmentionReceiveSchema } from '@kobato/server/domains/webmentions/schema'
import { loadPublicWebmentionsForTarget } from '@kobato/server/domains/webmentions/service'
import { implementPublic, rateLimitByIp } from '@kobato/server/http/orpc-base'
import { DomainError } from '@kobato/server/infra/http/errors'
import { isWebmentionReceiveEnabled } from '@kobato/settings/getters'

const INVALID_WEBMENTION_MESSAGE = 'Invalid webmention request: source and target must be valid http(s) URLs'
const DISABLED_WEBMENTION_MESSAGE = 'This endpoint no longer accepts webmentions'
const TARGET_NOT_FOUND_MESSAGE = 'target is not a resource on this site'

const list = implementPublic(webmentionsContract).list.handler(async ({ input, context }) => {
  const target = await resolveMetricTarget(context.db, input.page_key)
  const webmentions = await loadPublicWebmentionsForTarget(context.db, target)
  return { webmentions }
})

const receive = implementPublic(webmentionsContract)
  .receive.use(rateLimitByIp('webmention', 'resource'))
  .handler(async ({ input, context }): Promise<WebmentionReceiveOutput> => {
    if (context.settings === null) {
      throw new DomainError('NOT_FOUND', TARGET_NOT_FOUND_MESSAGE)
    }
    if (!isWebmentionReceiveEnabled(context.settings)) {
      return { kind: 'disabled', message: DISABLED_WEBMENTION_MESSAGE }
    }
    const parsed = webmentionReceiveSchema.safeParse(input)
    if (!parsed.success) {
      return { kind: 'invalid', message: INVALID_WEBMENTION_MESSAGE }
    }
    await enqueueWebmention(context.db, parsed.data)
    return { kind: 'accepted' }
  })

export const webmentionPublicRouter = implementPublic(webmentionsContract).router({
  list,
  receive,
})
