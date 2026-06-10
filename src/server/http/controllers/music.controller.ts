import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { getMusicMetaForPlayer } from '@/server/domains/music/services/read'
import { publicProc } from '@/server/http/orpc-base'
import { tryResourceRateLimit } from '@/server/infra/rate-limit'
import { publicMusicMetaDto } from '@/shared/contracts/music'

const get = publicProc
  .route({ method: 'GET', path: '/music/get' })
  .input(
    z.object({
      id: z
        .string()
        .trim()
        .regex(/^[a-z0-9]{16}$/, 'invalid player id'),
    }),
  )
  .output(z.object({ music: publicMusicMetaDto }))
  .handler(async ({ input, context }) => {
    const rateLimit = await tryResourceRateLimit(context.clientAddress)
    if (rateLimit.exceeded) {
      throw new ORPCError('TOO_MANY_REQUESTS', { message: '请求过于频繁，请稍后再试。' })
    }
    const meta = await getMusicMetaForPlayer(context.db, input.id)
    if (meta === null) {
      throw new ORPCError('NOT_FOUND', { message: '音乐不存在或已下线' })
    }
    return { music: meta }
  })

export const musicRouter = { get }
