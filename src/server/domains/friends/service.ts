import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { FriendRow } from '@/server/infra/db/types'
import type { Friend } from '@/shared/types/catalog'
import type { AdminFriendDto } from '@/shared/types/friends'

import { sendNewFriendApplication } from '@/server/domains/friends/email'
import { hydrateImageRefs } from '@/server/domains/images/services/enhance'
import {
  type AdminFriendsListFilters,
  countAdminFriends,
  deleteFriend as deleteFriendRow,
  findFriendByHomepage,
  findFriendById,
  insertFriend,
  listAdminFriendRows,
  listPublicFriendRows,
  updateFriend,
} from '@/server/infra/db/operations/friend'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('friends.service')

// Public projection (no `id`/`visible`/`createdAt`/`updatedAt`/`rssUrl`).
// The `Friend` shape exported from `@/shared/types/catalog` already matches —
// we just produce that DTO so the catalog stays decoupled from the DB
// row layout.
export interface PublicFriend {
  website: string
  description?: string
  homepage: string
  poster: string
}

export function toPublicFriend(row: FriendRow): PublicFriend {
  return {
    website: row.website,
    description: row.description ?? undefined,
    homepage: row.homepage,
    poster: row.poster,
  }
}

// Wire-format DTO returned by every admin friend endpoint. Bigint id
// stringified so the browser bundle never touches BigInt.
export function toAdminFriendDto(row: FriendRow): AdminFriendDto {
  return {
    id: String(row.id),
    website: row.website,
    description: row.description,
    homepage: row.homepage,
    poster: row.poster,
    rssUrl: row.rssUrl,
    visible: row.visible,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listPublicFriends(db: NodePgDatabase): Promise<PublicFriend[]> {
  const rows = await listPublicFriendRows(db)
  return rows.map(toPublicFriend)
}

export interface AdminFriendsListResult {
  friends: AdminFriendDto[]
  total: number
  /** True when `offset + rows.length < total` (i.e. another page exists). */
  hasMore: boolean
}

// Server-side pagination: parallel `[rows, total]` so we pay only one
// round-trip for the page-of-rows query and the COUNT(*). `total` is
// the full filtered count (independent of `offset`/`limit`) so the
// client can render the correct number of pagination buttons.
export async function listFriendsForAdmin(
  db: NodePgDatabase,
  filters: AdminFriendsListFilters,
): Promise<AdminFriendsListResult> {
  const offset = filters.offset ?? 0
  const [rows, total] = await Promise.all([
    listAdminFriendRows(db, filters),
    countAdminFriends(db, { q: filters.q, includeHidden: filters.includeHidden, visible: filters.visible }),
  ])
  return {
    friends: rows.map(toAdminFriendDto),
    total,
    hasMore: offset + rows.length < total,
  }
}

export interface UpsertFriendInputs {
  id?: bigint
  website: string
  description?: string | null
  homepage: string
  poster: string
  rssUrl?: string | null
  visible: boolean
}

// Single entry-point that the admin Resource Route action calls. The
// `id` distinguishes update from create; on create we soft-check
// `homepage` against existing rows to nudge the editor away from
// accidental duplicates (a hard UNIQUE constraint in the DB would
// reject benign protocol/trailing-slash variants the editor probably
// meant as updates — this stays at the service layer so the admin can
// still force the duplicate by editing the existing row directly).
export async function upsertAdminFriend(db: NodePgDatabase, input: UpsertFriendInputs): Promise<AdminFriendDto> {
  const description = normaliseNullable(input.description)
  const rssUrl = normaliseNullable(input.rssUrl)

  if (input.id === undefined) {
    const dup = await findFriendByHomepage(db, input.homepage)
    if (dup !== null) {
      throw new DomainError('CONFLICT', '已存在相同主页 URL 的友链', [
        { message: '主页 URL 已存在', path: ['homepage'] },
      ])
    }
    const row = await insertFriend(db, {
      website: input.website,
      description,
      homepage: input.homepage,
      poster: input.poster,
      rssUrl,
      visible: input.visible,
    })
    return toAdminFriendDto(row)
  }

  const existing = await findFriendById(db, input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '友链不存在')
  }
  // Allow the editor to keep the same `homepage` (it's the same row)
  // but reject collisions with OTHER rows so two friend entries can't
  // share the same URL by accident.
  if (existing.homepage !== input.homepage) {
    const dup = await findFriendByHomepage(db, input.homepage)
    if (dup !== null && dup.id !== input.id) {
      throw new DomainError('CONFLICT', '已存在相同主页 URL 的友链', [
        { message: '主页 URL 已存在', path: ['homepage'] },
      ])
    }
  }
  const updated = await updateFriend(db, input.id, {
    website: input.website,
    description,
    homepage: input.homepage,
    poster: input.poster,
    rssUrl,
    visible: input.visible,
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '友链不存在')
  }
  return toAdminFriendDto(updated)
}

export async function deleteAdminFriend(db: NodePgDatabase, id: bigint): Promise<boolean> {
  return deleteFriendRow(db, id)
}

// --- Public application -----------------------------------------------------

export interface ApplyFriendInputs {
  website: string
  homepage: string
  description?: string
  poster?: string
  rssUrl?: string
}

// Entry-point for the public `friends.apply` procedure. The row lands
// as `visible: false` (pending) — approval is the admin flipping the
// flag. `homepage` duplicates are rejected with the same soft-check
// the admin upsert path uses, so the pending queue can't accumulate
// repeat applications. The admin notification is fire-and-forget: a
// mail-pipeline hiccup must never fail the application (the
// `sendNewComment` precedent).
export async function applyFriend(db: NodePgDatabase, input: ApplyFriendInputs): Promise<void> {
  const dup = await findFriendByHomepage(db, input.homepage)
  if (dup !== null) {
    throw new DomainError('CONFLICT', '该主页已经提交过友链申请，请勿重复提交。', [
      { message: '主页 URL 已提交过', path: ['homepage'] },
    ])
  }
  const row = await insertFriend(db, {
    website: input.website,
    description: normaliseNullable(input.description),
    homepage: input.homepage,
    // `friend.poster` is NOT NULL and applicants rarely have a cover
    // URL handy — store '' and let the admin fill it before approving
    // (the admin upsert schema requires a valid poster URL, so a
    // poster-less application can't go public by accident).
    poster: input.poster ?? '',
    rssUrl: normaliseNullable(input.rssUrl),
    visible: false,
  })
  void sendNewFriendApplication(row).catch((error) => {
    log.error('failed to send friend application email', { error })
  })
}

// Trim and collapse the empty string to `null` so the DB never stores
// "" as a sentinel for "no description". Drizzle's nullable text
// columns accept `null` directly.
function normaliseNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// --- Public catalog queries -------------------------------------------------

async function hydrateFriendImages(db: NodePgDatabase, friends: Friend[]): Promise<void> {
  await hydrateImageRefs(
    db,
    friends,
    (f) => f.poster,
    (f, lookup) => {
      f.posterThumbhash = lookup?.thumbhash
      if (lookup?.publicUrl != null) {
        f.poster = lookup.publicUrl
      }
    },
  )
}

export async function listAllFriends(db: NodePgDatabase): Promise<Friend[]> {
  const rows = await listPublicFriends(db)
  const friends = rows.map((row) => ({
    website: row.website,
    description: row.description,
    homepage: row.homepage,
    poster: row.poster,
  }))
  await hydrateFriendImages(db, friends)
  return friends
}
