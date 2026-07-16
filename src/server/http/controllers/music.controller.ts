import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { getMusicMetaForPlayer } from '@/server/domains/music/services/read'
import { publicProc, resourceRateLimit } from '@/server/http/orpc-base'
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
  .use(resourceRateLimit)
  .handler(async ({ input, context }) => {
    const meta = await getMusicMetaForPlayer(context.db, input.id)
    if (meta === null) {
      throw new ORPCError('NOT_FOUND', { message: '音乐不存在或已下线' })
    }
    return { music: meta }
  })

export const musicRouter = { get }
