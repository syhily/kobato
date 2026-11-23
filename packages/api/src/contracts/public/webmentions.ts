import { idString, isoDateTime } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const WEBMENTION_TYPES = ['mention', 'reply', 'like', 'repost'] as const

export const publicWebmentionDto = z.object({
  id: idString,
  sourceUrl: z.string(),
  type: z.enum(WEBMENTION_TYPES),
  authorName: z.string().nullable(),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: isoDateTime,
})
export type PublicWebmentionWire = z.infer<typeof publicWebmentionDto>

export const webmentionPublicListSchema = z.object({ page_key: z.string() })

export const webmentionPublicListOutputSchema = z.object({ webmentions: z.array(publicWebmentionDto) })
export type WebmentionPublicListOutput = z.infer<typeof webmentionPublicListOutputSchema>
