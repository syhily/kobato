import { idString, isoDateTime } from '@kobato/shared/contracts/primitives'
import { z } from 'zod'

export const adminFriendDto = z.object({
  id: idString,
  website: z.string(),
  description: z.string().nullable(),
  homepage: z.string(),
  poster: z.string(),
  rssUrl: z.string().nullable(),
  visible: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminFriendDto = z.infer<typeof adminFriendDto>
