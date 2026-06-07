import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { idString, isoDateTime, markdownHeadingDto } from '@/shared/contracts/primitives'
import { portableTextBodySchema } from '@/shared/pt/schema'

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
