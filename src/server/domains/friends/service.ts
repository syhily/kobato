import type { Database } from '@/server/infra/db/database'
import type { FriendRow } from '@/server/infra/db/types'
import type { AdminFriendDto } from '@/shared/contracts/friends'
import type { Friend } from '@/shared/types/catalog'

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
import { fireAndForgetNotify } from '@/server/infra/email/admin-notification'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('friends.service')

// Public projection matching `Friend` in `@/shared/types/catalog`.
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

export async function listPublicFriends(db: Database): Promise<PublicFriend[]> {
  const rows = await listPublicFriendRows(db)
  return rows.map(toPublicFriend)
}

export interface AdminFriendsListResult {
  friends: AdminFriendDto[]
  total: number
  /** True when another page exists. */
  hasMore: boolean
}

// `total` is the full filtered count, independent of `offset`/`limit`.
export async function listFriendsForAdmin(
  db: Database,
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
  id?: number
  website: string
  description?: string | null
  homepage: string
  poster: string
  rssUrl?: string | null
  visible: boolean
}

// Duplicate `homepage` is a soft check: reject other rows with the same URL,
// allow protocol/trailing-slash variants.
export async function upsertAdminFriend(db: Database, input: UpsertFriendInputs): Promise<AdminFriendDto> {
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
  // Reject the URL only when another row already owns it.
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

export async function deleteAdminFriend(db: Database, id: number): Promise<boolean> {
  return deleteFriendRow(db, id)
}

export interface ApplyFriendInputs {
  website: string
  homepage: string
  description?: string
  poster?: string
  rssUrl?: string
}

// Public `friends.apply`: rows land `visible: false` (pending); the admin
// notification is fire-and-forget.
export async function applyFriend(db: Database, input: ApplyFriendInputs): Promise<void> {
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
    // Store '' — the admin upsert schema still requires a valid poster URL.
    poster: input.poster ?? '',
    rssUrl: normaliseNullable(input.rssUrl),
    visible: false,
  })
  fireAndForgetNotify(sendNewFriendApplication(row), log, 'friend application')
}

// Trim; collapse '' to `null` — the DB never stores "" as a sentinel.
function normaliseNullable(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

async function hydrateFriendImages(db: Database, friends: Friend[]): Promise<void> {
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

export async function listAllFriends(db: Database): Promise<Friend[]> {
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
