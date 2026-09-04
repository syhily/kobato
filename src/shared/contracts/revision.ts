import { z } from 'zod'

import { idString, isoDateTime, markdownHeadingDto } from '@/shared/contracts/primitives'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'
import { safeBoolean } from '@/shared/utils/schema'

export const adminRevisionDto = z.object({
  id: idString,
  revisionNo: z.number().int().nonnegative(),
  status: z.enum(['draft', 'published']),
  // Lexical editing state (plan round R9a) — the storage format flip.
  body: lexicalEditorStateSchema,
  imageSources: z.array(z.string()),
  headings: z.array(markdownHeadingDto),
  authorId: idString.nullable(),
  clientRevisionToken: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminRevisionDto = z.infer<typeof adminRevisionDto>

// Single statement of the post/page body-save input shape; the admin posts
// and pages controllers both consume it.
export const saveBodyInput = z.object({
  id: z.string().min(1),
  body: lexicalEditorStateSchema,
  expectedClientRevisionToken: z.uuid().nullable().optional(),
  force: safeBoolean().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})
export type SaveBodyInput = z.infer<typeof saveBodyInput>

// The server emits `warning` when a non-fatal side effect (image-library
// sync) failed — the editor surfaces it instead of swallowing it.
export const saveResultOutput = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), revision: adminRevisionDto, warning: z.string().optional() }),
  z.object({
    status: z.literal('conflict'),
    latest: adminRevisionDto,
    expectedToken: z.string(),
    warning: z.string().optional(),
  }),
])
export type SaveBodyOutput = z.infer<typeof saveResultOutput>
