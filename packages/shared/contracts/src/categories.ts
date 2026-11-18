import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

export const adminCategoryDto = z.object({
  id: idString,
  name: z.string(),
  slug: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  description: z.string(),
  sortOrder: z.number().int(),
  // Live post count; mirrors the delete-block guard (postCount > 0 → 409).
  // Computed by the service, not persisted.
  postCount: z.number().int().nonnegative(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminCategoryDto = z.infer<typeof adminCategoryDto>

// Admin categories wire — the single Zod source the `@kobato/api` categories
// contract composes and the server validates against.

export const adminCategoriesListInput = z.object({ q: z.string().optional() })
export type AdminCategoriesListInput = z.infer<typeof adminCategoriesListInput>

export const adminCategoriesListOutputDto = z.object({ categories: z.array(adminCategoryDto), total: z.number() })
export type AdminCategoriesListOutput = z.infer<typeof adminCategoriesListOutputDto>

export const adminCategoryUpsertInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(20),
  slug: z.string().optional(),
  cover: z.url().max(500),
  og: z.url().max(500).optional(),
  description: z.string().max(999).optional(),
})
export type AdminCategoryUpsertInput = z.infer<typeof adminCategoryUpsertInput>

export const adminCategoryUpsertOutputDto = z.object({ category: adminCategoryDto })
export type AdminCategoryUpsertOutput = z.infer<typeof adminCategoryUpsertOutputDto>

export const adminCategoryIdInput = z.object({ id: z.string().min(1) })
export type AdminCategoryIdInput = z.infer<typeof adminCategoryIdInput>

export const adminCategoriesReorderInput = z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) })
export type AdminCategoriesReorderInput = z.infer<typeof adminCategoriesReorderInput>

export const adminCategoriesReorderOutputDto = z.object({ categories: z.array(adminCategoryDto) })
export type AdminCategoriesReorderOutput = z.infer<typeof adminCategoriesReorderOutputDto>
