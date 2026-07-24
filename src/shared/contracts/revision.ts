import { z } from 'zod'

import { idString, isoDateTime, markdownHeadingDto } from '@/shared/contracts/primitives'
import { portableTextBodySchema } from '@/shared/pt/schema'
import { safeBoolean } from '@/shared/utils/schema'

export const adminRevisionDto = z.object({
  id: idString,
  revisionNo: z.number().int().nonnegative(),
  status: z.enum(['draft', 'published']),
  body: portableTextBodySchema,
  imageSources: z.array(z.string()),
  headings: z.array(markdownHeadingDto),
  authorId: idString.nullable(),
  clientRevisionToken: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminRevisionDto = z.infer<typeof adminRevisionDto>

// Single statement of the post/page body-save + preview input shapes; the
// admin posts and pages controllers both consume these.
export const saveBodyInput = z.object({
  id: z.string().min(1),
  body: portableTextBodySchema,
  expectedClientRevisionToken: z.uuid().nullable().optional(),
  force: safeBoolean().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})
export type SaveBodyInput = z.infer<typeof saveBodyInput>

export const previewBodyInput = z.object({
  body: portableTextBodySchema,
})

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

export const previewOutputDto = z.object({
  html: z.string(),
  headings: z.array(markdownHeadingDto),
})
