import { newsletterContract } from '@kobato/api/rpc/public/newsletter'
import { confirm, subscribe, unsubscribe } from '@kobato/server/domains/newsletter/service'
import { implementPublic, localizedOrpcError, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { tryNewsletterSubscribeByEmailRateLimit } from '@kobato/server/infra/rate-limit'
import { idFromString } from '@kobato/utils/id'

const impl = implementPublic(newsletterContract).use(resourceRateLimit)

const subscribeProc = impl.subscribe.handler(async ({ input, context }) => {
  const byEmail = await tryNewsletterSubscribeByEmailRateLimit(input.email)
  if (byEmail.exceeded) {
    throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'newsletter.error.rateLimited')
  }
  await subscribe(context.db, input.email)
  return { ok: true as const }
})

const confirmProc = impl.confirm.handler(async ({ input, context }) => {
  await confirm(context.db, input.token)
  return { ok: true as const }
})

const unsubscribeProc = impl.unsubscribe.handler(async ({ input, context }) => {
  await unsubscribe(context.db, idFromString(input.id), input.sig)
  return { ok: true as const }
})

export const newsletterRouter = impl.router({
  subscribe: subscribeProc,
  confirm: confirmProc,
  unsubscribe: unsubscribeProc,
})
