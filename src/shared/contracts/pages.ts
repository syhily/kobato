import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminPageDetailDto, AdminPageDto, ListPageRevisionsOutput, ListPagesOutput } from '@/shared/types/pages'

import { idString, isoDateTime } from '@/shared/contracts/primitives'
import { adminRevisionDto } from '@/shared/contracts/revision'

export const adminPageDto = z.object({
  id: idString,
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  published: z.boolean(),
  commentsEnabled: z.boolean(),
  showToc: z.boolean(),
  showUpdated: z.boolean(),
  showFriends: z.boolean(),
  publishedAt: isoDateTime,
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  commentCount: z.number().int().nonnegative(),
  commentPublicId: z.string(),
})

export const adminPageDetailDto = z.object({
  page: adminPageDto,
  latestRevision: adminRevisionDto.nullable(),
  publishedRevision: adminRevisionDto.nullable(),
})

export const listPagesOutputDto = z.object({
  pages: z.array(adminPageDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export const listPageRevisionsOutputDto = z.object({
  revisions: z.array(adminRevisionDto),
})

// ─── parity assertions ─────────────────────────────────
type _adminPageDtoParity = Assert<Equals<z.infer<typeof adminPageDto>, AdminPageDto>>
type _adminPageDetailParity = Assert<Equals<z.infer<typeof adminPageDetailDto>, AdminPageDetailDto>>
type _listPagesOutputParity = Assert<Equals<z.infer<typeof listPagesOutputDto>, ListPagesOutput>>
type _listPageRevisionsOutputParity = Assert<
  Equals<z.infer<typeof listPageRevisionsOutputDto>, ListPageRevisionsOutput>
>
