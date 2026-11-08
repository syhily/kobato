import { z } from 'zod'

import {
  newsletterConfirmSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@/server/domains/newsletter/schema'
import { confirm, subscribe, unsubscribe } from '@/server/domains/newsletter/service'
import { localizedOrpcError, publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { tryNewsletterSubscribeByEmailRateLimit } from '@/server/infra/rate-limit'
import { idFromString } from '@/shared/utils/id'

// Uniform `{ ok: true }` — must not reveal whether an address was ever seen.
const okOutput = z.object({ ok: z.literal(true) })

const subscribeProc = publicProc
  .route({ method: 'POST', path: '/newsletter/subscribe' })
  // Limiter before `.input(...)`: oRPC validates input at its declared
  // index, so a trailing middleware never sees a malformed payload.
  .use(resourceRateLimit)
  .input(newsletterSubscribeSchema)
  .output(okOutput)
  .handler(async ({ input, context }) => {
    // Anonymous + mails the submitted address: cap per-address too, or a
    // distributed spray relays unlimited confirmation mail to one victim.
    const byEmail = await tryNewsletterSubscribeByEmailRateLimit(input.email)
    if (byEmail.exceeded) {
      throw localizedOrpcError(context, 'TOO_MANY_REQUESTS', 'newsletter.error.rateLimited')
    }
    await subscribe(context.db, input.email)
    return { ok: true as const }
  })

const confirmProc = publicProc
  .route({ method: 'POST', path: '/newsletter/confirm' })
  .use(resourceRateLimit)
  .input(newsletterConfirmSchema)
  .output(okOutput)
  .handler(async ({ input, context }) => {
    await confirm(context.db, input.token)
    return { ok: true as const }
  })

const unsubscribeProc = publicProc
  .route({ method: 'POST', path: '/newsletter/unsubscribe' })
  .use(resourceRateLimit)
  .input(newsletterUnsubscribeSchema)
  .output(okOutput)
  .handler(async ({ input, context }) => {
    await unsubscribe(context.db, idFromString(input.id), input.sig)
    return { ok: true as const }
  })

export const newsletterPublicRouter = {
  subscribe: subscribeProc,
  confirm: confirmProc,
  unsubscribe: unsubscribeProc,
}
