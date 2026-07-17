import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { PreviewPageBodyOutput } from '@/shared/types/pages'
import type { PreviewPostBodyOutput } from '@/shared/types/posts'
import type { AdminRevisionDto, SaveBodyInput, SaveBodyOutput } from '@/shared/types/revision'

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

// Single statement of the post/page body-save + preview input shapes; the
// admin posts and pages controllers both consume these.
export const saveBodyInput = z.object({
  id: z.string().min(1),
  body: portableTextBodySchema,
  expectedClientRevisionToken: z.uuid().nullable().optional(),
  force: safeBoolean().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})

export const previewBodyInput = z.object({
  body: portableTextBodySchema,
})

export const saveResultOutput = z.discriminatedUnion('status', [
  z.object({ status: z.literal('saved'), revision: adminRevisionDto, warning: z.string().optional() }),
  z.object({
    status: z.literal('conflict'),
    latest: adminRevisionDto,
    expectedToken: z.string(),
    warning: z.string().optional(),
  }),
])

export const previewOutputDto = z.object({
  html: z.string(),
  headings: z.array(markdownHeadingDto),
})

// ─── parity helpers ────────────────────────────────────
type _adminRevisionDtoParity = Assert<Equals<z.infer<typeof adminRevisionDto>, AdminRevisionDto>>
type _saveBodyInputParity = Assert<Equals<z.infer<typeof saveBodyInput>, SaveBodyInput>>
type _saveResultOutputParity = Assert<Equals<z.infer<typeof saveResultOutput>, SaveBodyOutput>>
type _previewOutputPostParity = Assert<Equals<z.infer<typeof previewOutputDto>, PreviewPostBodyOutput>>
type _previewOutputPageParity = Assert<Equals<z.infer<typeof previewOutputDto>, PreviewPageBodyOutput>>
