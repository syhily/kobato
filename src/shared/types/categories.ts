// Wire-format DTOs for the category-management endpoints. Shared so
// server (admin actions) and client (admin UI) import the same shape.
// Bigints are stringified; the public site never ships `id`.

import type { AdminCategoryDto } from '@/shared/contracts/categories'

export interface ListCategoriesInput {
  q?: string
}

export interface ListCategoriesOutput {
  categories: AdminCategoryDto[]
  total: number
}

// `id` absent → create; present → update. `description` defaults to ""
// and `sortOrder` to 0 on create. `slug` omitted/empty → derived from
// `name` via `deriveSlug`, matching the tag and page flows.
export interface UpsertCategoryInput {
  id?: string
  name: string
  slug?: string
  cover: string
  og?: string
  description?: string
  sortOrder?: number
}

export interface UpsertCategoryOutput {
  category: AdminCategoryDto
}

export interface DeleteCategoryInput {
  id: string
}

export interface DeleteCategoryOutput {
  success: boolean
}

// Drag-to-reorder: the UI sends the full ordered id list; the server
// validates it against the live row set and rewrites `sortOrder` in one
// transaction, returning the fresh DTOs so no follow-up `list` round-trip.
export interface ReorderCategoriesInput {
  orderedIds: string[]
}

export interface ReorderCategoriesOutput {
  categories: AdminCategoryDto[]
}
