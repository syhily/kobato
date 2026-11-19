import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

export const adminTagDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  ogImage: z.string(),
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminTagDto = z.infer<typeof adminTagDto>

export const adminTagsListInput = z.object({
  q: z.string().optional(),
  offset: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
})
export type AdminTagsListInput = z.infer<typeof adminTagsListInput>

export const adminTagsListOutputDto = z.object({
  tags: z.array(adminTagDto),
  total: z.number(),
  hasMore: z.boolean(),
})
export type AdminTagsListOutput = z.infer<typeof adminTagsListOutputDto>

export const adminTagUpsertInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(20),
  slug: z.string().optional(),
  ogImage: z.string().optional(),
})
export type AdminTagUpsertInput = z.infer<typeof adminTagUpsertInput>

export const adminTagUpsertOutputDto = z.object({ tag: adminTagDto })
export type AdminTagUpsertOutput = z.infer<typeof adminTagUpsertOutputDto>

export const adminTagIdInput = z.object({ id: z.string().min(1) })
export type AdminTagIdInput = z.infer<typeof adminTagIdInput>
