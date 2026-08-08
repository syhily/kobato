// Wire-format DTOs for the tag-management endpoints. Shared so
// server (admin actions) and client (admin UI) import the same shape.
// Bigints are stringified; the public site never ships `id`.

import type { AdminTagDto } from '@/shared/contracts/tags'

// `offset`/`limit` mirror the comment moderation listing: server-side
// pagination, both optional (client default `offset=0, limit=20`).
export interface ListTagsInput {
  q?: string
  offset?: number
  limit?: number
}

export interface ListTagsOutput {
  tags: AdminTagDto[]
  /** Total number of tags matching `q` (independent of `offset`/`limit`). */
  total: number
  /** True when `offset + limit < total`. Lets the client skip its own arithmetic. */
  hasMore: boolean
}

// `id` absent → create; present → update. Blank `slug` → derived from
// `name` via `pinyin-pro`.
export interface UpsertTagInput {
  id?: string
  name: string
  slug?: string
  ogImage?: string
}

export interface UpsertTagOutput {
  tag: AdminTagDto
}

export interface DeleteTagInput {
  id: string
}

export interface DeleteTagOutput {
  success: true
}
