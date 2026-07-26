// Wire-format DTOs for the category-management endpoints. Lives in
// `@/shared` so both the server (admin actions) and the client
// (admin UI fetcher) can import the same shape without crossing the
// server/client boundary. Bigints are stringified — the public site
// never ships `id` to the browser, but the admin shell uses it as
// the React list key.

import type { AdminCategoryDto } from '@/shared/contracts/categories'

export interface ListCategoriesInput {
  q?: string
}

export interface ListCategoriesOutput {
  categories: AdminCategoryDto[]
  total: number
}

// `id` absent → create a new row. Present → update the matching row.
// `description` defaults to "" and `sortOrder` to 0 on create.
// `slug` is wire-optional: when omitted (or empty), the server derives
// one from `name` via `deriveSlug` (pinyin-pro -> github-slugger),
// matching the tag and page flows.
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

// Drag-to-reorder payload. The admin UI sends the full ordered id list;
// the server validates it against the live row set and rewrites every
// row's `sortOrder` in one transaction. Returns the freshly-ordered DTOs
// so the client can swap state without a follow-up `list` round-trip.
export interface ReorderCategoriesInput {
  orderedIds: string[]
}

export interface ReorderCategoriesOutput {
  categories: AdminCategoryDto[]
}
