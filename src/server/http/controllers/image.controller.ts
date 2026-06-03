import { z } from 'zod'

import { loadImageThumbhash } from '@/server/domains/images/services/cover'
import { publicProc } from '@/server/http/orpc-base'

const resolveThumbhash = publicProc
  .route({ method: 'GET', path: '/image/resolve-thumbhash' })
  .input(z.object({ src: z.string().trim().min(1).max(2000) }))
  .output(
    z.object({
      thumbhash: z.string().nullable(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
  )
  .handler(async ({ input, context }) => {
    const image = await loadImageThumbhash(context.db, input.src)
    return {
      thumbhash: image?.thumbhash ?? null,
      width: image?.width ?? null,
      height: image?.height ?? null,
    }
  })

export const imageRouter = { resolveThumbhash }
