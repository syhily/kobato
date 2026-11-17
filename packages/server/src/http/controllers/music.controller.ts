import { publicMusicMetaDto } from '@kobato/shared/contracts/music.ts'
import { z } from 'zod'

import { getMusicMetaForPlayer } from '../../domains/music/services/read'
import { localizedOrpcError, publicProc, resourceRateLimit } from '../orpc-base'

const get = publicProc
  .route({ method: 'GET', path: '/music/get' })
  // Limiter before `.input(...)`: oRPC validates input at its declared
  // index, so a trailing middleware never sees a malformed payload.
  .use(resourceRateLimit)
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
    const meta = await getMusicMetaForPlayer(context.db, input.id)
    if (meta === null) {
      throw localizedOrpcError(context, 'NOT_FOUND', 'music.error.notFoundOrOffline')
    }
    return { music: meta }
  })

export const musicRouter = { get }
