import { newsletterContract } from '@kobato/api/newsletter.ts'
import { confirm, subscribe, unsubscribe } from '@kobato/server/domains/newsletter/service.ts'
import { implementPublic, localizedOrpcError, resourceRateLimit } from '@kobato/server/http/orpc-base.ts'
import { tryNewsletterSubscribeByEmailRateLimit } from '@kobato/server/infra/rate-limit.ts'
import { idFromString } from '@kobato/utils/id.ts'

// Contract-first: method/path/input/output live in `@kobato/api/newsletter.ts`;
// this controller only implements the procedures. The limiter rides the
// implementer so it runs BEFORE the contract's input validation.
const impl = implementPublic(newsletterContract).use(resourceRateLimit)

const subscribeProc = impl.subscribe.handler(async ({ input, context }) => {
  // Anonymous + mails the submitted address: cap per-address too, or a
  // distributed spray relays unlimited confirmation mail to one victim.
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

export const newsletterPublicRouter = impl.router({
  subscribe: subscribeProc,
  confirm: confirmProc,
  unsubscribe: unsubscribeProc,
})
