// Wire-format DTOs for the friend-management endpoints. Shared so
// server (admin actions) and client (admin UI) import the same shape.
// Bigints are stringified; the public site never ships `id`.

import type { AdminFriendDto } from '@/shared/contracts/friends'

// `offset`/`limit` mirror the tag and comment listings: server-side
// pagination, both optional (client default `offset=0, limit=10`).
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

// `id` absent → create; present → update. `visible` defaults to true on
// create; explicit values always override on update.
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
