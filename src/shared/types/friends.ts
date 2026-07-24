// Wire-format DTOs for the friend-management endpoints. Lives in
// `@/shared` so both the server (admin actions) and the client
// (admin UI fetcher) can import the same shape without crossing the
// server/client boundary. Bigints are stringified — the public site
// never ships `id` to the browser, but the admin shell uses it as
// the React list key.

import type { AdminFriendDto } from '@/shared/contracts/friends'

// `offset` / `limit` mirror the tag and comment moderation listings:
// the admin table is paginated server-side because friend rows can
// grow to a hundred-plus on long-running blogs and shipping all of
// them every time `?q=` changes both bloats the response and stalls
// the table render. Both are optional — omitted requests fall back
// to `offset=0, limit=10` (the default page size on the client).
export interface ListFriendsInput {
  q?: string
  includeHidden?: boolean
  /** Exact visibility match; takes precedence over `includeHidden` (pending-review bucket). */
  visible?: boolean
  offset?: number
  limit?: number
}

export interface ListFriendsOutput {
  friends: AdminFriendDto[]
  /** Total number of friends matching `q` + `includeHidden` (independent of `offset`/`limit`). */
  total: number
  /** True when `offset + limit < total`. Lets the client skip its own arithmetic. */
  hasMore: boolean
}

// `id` absent → create a new row. Present → update the matching row.
// `visible` defaults to true on create; explicit `true`/`false`
// always overrides the stored value on update.
export interface UpsertFriendInput {
  id?: string
  website: string
  description?: string | null
  homepage: string
  poster: string
  rssUrl?: string | null
  visible?: boolean
}

export interface UpsertFriendOutput {
  friend: AdminFriendDto
}

export interface DeleteFriendInput {
  id: string
}

export interface DeleteFriendOutput {
  success: boolean
}
