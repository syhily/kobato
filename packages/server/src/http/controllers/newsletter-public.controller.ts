import {
  newsletterConfirmSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@kobato/server/domains/newsletter/schema'
import { confirm, subscribe, unsubscribe } from '@kobato/server/domains/newsletter/service'
import { frontendKeyAuth, publicProc, resourceRateLimit } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/shared/utils/id'
import { z } from 'zod'

// Uniform `{ ok: true }` on every path — the response must not reveal
// whether an address is already subscribed (or was ever seen).
const okOutput = z.object({ ok: z.literal(true) })

// Visitor submits ride the frontend's proxy chain (the plan's "newsletter
// 订阅属访客交互，经前端代理" rule): `frontendKeyAuth` runs first so the
// per-IP bucket counts the visitor address forwarded behind a valid key,
// and the proxy-chain jar merge (comment tokens) never applies here.
const subscribeProc = publicProc
  .route({ method: 'POST', path: '/content/v1/newsletter/subscribe' })
  .input(newsletterSubscribeSchema)
  .output(okOutput)
  .use(frontendKeyAuth)
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    await subscribe(context.db, input.email)
    return { ok: true as const }
  })

const confirmProc = publicProc
  .route({ method: 'POST', path: '/content/v1/newsletter/confirm' })
  .input(newsletterConfirmSchema)
  .output(okOutput)
  .use(frontendKeyAuth)
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    await confirm(context.db, input.token)
    return { ok: true as const }
  })

const unsubscribeProc = publicProc
  .route({ method: 'POST', path: '/content/v1/newsletter/unsubscribe' })
  .input(newsletterUnsubscribeSchema)
  .output(okOutput)
  .use(frontendKeyAuth)
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
