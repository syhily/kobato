// Wire-format DTOs for the tag-management endpoints. Lives in
// `@/shared` so both the server (admin actions) and the client
// (admin UI fetcher) can import the same shape without crossing the
// server/client boundary. Bigints are stringified — the public site
// never ships `id` to the browser, but the admin shell uses it as
// the React list key.

import type { AdminTagDto } from '@/shared/contracts/tags'

// `offset` / `limit` mirror the comment moderation listing
// (`LoadAllCommentsInput`): the admin table is paginated server-side.
// Both are optional — omitted requests fall back to `offset=0, limit=20`
// (the default page size on the client).
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

// `id` absent → create a new row. Present → update the matching row.
// `slug` is optional on input; the server derives it from `name`
// via `pinyin-pro` when blank.
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
