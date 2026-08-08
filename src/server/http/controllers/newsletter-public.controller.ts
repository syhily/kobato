import { z } from 'zod'

import {
  newsletterConfirmSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@/server/domains/newsletter/schema'
import { confirm, subscribe, unsubscribe } from '@/server/domains/newsletter/service'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { idFromString } from '@/shared/utils/id'

// Uniform `{ ok: true }` — must not reveal whether an address was ever seen.
const okOutput = z.object({ ok: z.literal(true) })

const subscribeProc = publicProc
  .route({ method: 'POST', path: '/newsletter/subscribe' })
  .input(newsletterSubscribeSchema)
  .output(okOutput)
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    await subscribe(context.db, input.email)
    return { ok: true as const }
  })

const confirmProc = publicProc
  .route({ method: 'POST', path: '/newsletter/confirm' })
  .input(newsletterConfirmSchema)
  .output(okOutput)
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    await confirm(context.db, input.token)
    return { ok: true as const }
  })

const unsubscribeProc = publicProc
  .route({ method: 'POST', path: '/newsletter/unsubscribe' })
  .input(newsletterUnsubscribeSchema)
  .output(okOutput)
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    await unsubscribe(context.db, idFromString(input.id), input.sig)
    return { ok: true as const }
  })

export const newsletterPublicRouter = {
  subscribe: subscribeProc,
  confirm: confirmProc,
  unsubscribe: unsubscribeProc,
}
