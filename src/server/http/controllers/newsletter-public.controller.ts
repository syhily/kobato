import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import {
  newsletterConfirmSchema,
  newsletterSubscribeSchema,
  newsletterUnsubscribeSchema,
} from '@/server/domains/newsletter/schema'
import { confirm, subscribe, unsubscribe } from '@/server/domains/newsletter/service'
import { publicProc } from '@/server/http/orpc-base'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'

const RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试。'

async function guardRateLimit(clientAddress: string): Promise<void> {
  const rateLimit = await tryResourceRateLimit(clientAddress)
  if (rateLimit.exceeded) {
    throw new ORPCError('TOO_MANY_REQUESTS', { message: RATE_LIMIT_MESSAGE })
  }
}

// Uniform `{ ok: true }` on every path — the response must not reveal
// whether an address is already subscribed (or was ever seen).
const okOutput = z.object({ ok: z.literal(true) })

const subscribeProc = publicProc
  .route({ method: 'POST', path: '/newsletter/subscribe' })
  .input(newsletterSubscribeSchema)
  .output(okOutput)
  .handler(async ({ input, context }) => {
    await guardRateLimit(context.clientAddress)
    await subscribe(context.db, input.email)
    return { ok: true as const }
  })

const confirmProc = publicProc
  .route({ method: 'POST', path: '/newsletter/confirm' })
  .input(newsletterConfirmSchema)
  .output(okOutput)
  .handler(async ({ input, context }) => {
    await guardRateLimit(context.clientAddress)
    await confirm(context.db, input.token)
    return { ok: true as const }
  })

const unsubscribeProc = publicProc
  .route({ method: 'POST', path: '/newsletter/unsubscribe' })
  .input(newsletterUnsubscribeSchema)
  .output(okOutput)
  .handler(async ({ input, context }) => {
    await guardRateLimit(context.clientAddress)
    await unsubscribe(context.db, BigInt(input.id), input.sig)
    return { ok: true as const }
  })

export const newsletterPublicRouter = {
  subscribe: subscribeProc,
  confirm: confirmProc,
  unsubscribe: unsubscribeProc,
}
