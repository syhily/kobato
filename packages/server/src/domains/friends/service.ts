import type { AdminFriendDto } from '@kobato/api/contracts/admin/friends'
import type { Friend } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { FriendRow } from '@kobato/db/sqlite/types'

import { isOnSiteOrigin } from '@kobato/assets/asset-url'
import { extractFriendHostSafe, friendPosterStoragePath, friendPosterStoragePathFromUrl } from '@kobato/assets/images'
import { findImagesByStoragePaths, updateImageStoragePath } from '@kobato/db/sqlite/operations/content/image'
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
} from '@kobato/db/sqlite/operations/engagement/friend'
import { sendNewFriendApplication } from '@kobato/server/domains/friends/email'
import { hydrateImageRefs } from '@kobato/server/domains/images/services/enhance'
import { fireAndForgetNotify } from '@kobato/server/infra/email/admin-notification'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { getGeneralWebsite } from '@kobato/server/infra/storage/public-url'
import { backendFor } from '@kobato/server/infra/storage/registry'

const log = getLogger('friends.service')

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
  hasMore: boolean
}

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

export async function upsertAdminFriend(db: Database, input: UpsertFriendInputs): Promise<AdminFriendDto> {
  const description = normaliseNullable(input.description)
  const rssUrl = normaliseNullable(input.rssUrl)
  const poster = assertUploadedPoster(input.homepage, input.poster)

  if (input.id === undefined) {
    const dup = await findFriendByHomepage(db, input.homepage)
    if (dup !== null) {
      throw new DomainError('CONFLICT', descriptorFor('friends.error.duplicateHomepage'), [
        { ...descriptorFor('friends.error.homepageTaken'), path: ['homepage'] },
      ])
    }
    const row = await insertFriend(db, {
      website: input.website,
      description,
      homepage: input.homepage,
      poster,
      rssUrl,
      visible: input.visible,
    })
    return toAdminFriendDto(row)
  }

  const existing = await findFriendById(db, input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('friends.error.notFound'))
  }
  if (existing.homepage !== input.homepage) {
    const dup = await findFriendByHomepage(db, input.homepage)
    if (dup !== null && dup.id !== input.id) {
      throw new DomainError('CONFLICT', descriptorFor('friends.error.duplicateHomepage'), [
        { ...descriptorFor('friends.error.homepageTaken'), path: ['homepage'] },
      ])
    }
  }
  const nextPoster = await relocatePosterForHomepage(db, existing.homepage, existing.poster, input.homepage, poster)
  const updated = await updateFriend(db, input.id, {
    website: input.website,
    description,
    homepage: input.homepage,
    poster: nextPoster,
    rssUrl,
    visible: input.visible,
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('friends.error.notFound'))
  }
  return toAdminFriendDto(updated)
}

function invalidPosterError(): DomainError {
  return new DomainError('BAD_REQUEST', descriptorFor('friends.error.posterUploadRequired'), [
    { ...descriptorFor('friends.error.posterUploadRequired'), path: ['poster'] },
  ])
}

function assertUploadedPoster(homepage: string, poster: string): string {
  const trimmed = poster.trim()
  const expected = friendPosterStoragePath(homepage)
  if (expected === null || friendPosterStoragePathFromUrl(trimmed) !== expected) {
    throw invalidPosterError()
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (!isOnSiteOrigin(new URL(trimmed), getGeneralWebsite())) {
      throw invalidPosterError()
    }
  }
  return trimmed
}

async function relocatePosterForHomepage(
  db: Database,
  previousHomepage: string,
  previousPoster: string,
  homepage: string,
  poster: string,
): Promise<string> {
  if (extractFriendHostSafe(previousHomepage) === extractFriendHostSafe(homepage)) {
    return poster
  }
  const previousPath = friendPosterStoragePath(previousHomepage)
  const targetPath = friendPosterStoragePath(homepage)
  if (previousPath === null || targetPath === null || friendPosterStoragePathFromUrl(previousPoster) !== previousPath) {
    return poster
  }
  const rows = await findImagesByStoragePaths(db, [previousPath, targetPath])
  if (rows.some((row) => row.storagePath === targetPath)) {
    return poster
  }
  const source = rows.find((row) => row.storagePath === previousPath)
  if (source === undefined) {
    throw new DomainError('NOT_FOUND', descriptorFor('images.error.objectMissing'))
  }
  const backend = backendFor(source.storageDriver)
  try {
    const body = await backend.get(previousPath)
    await backend.put({ key: targetPath, body, contentType: source.mimeType, visibility: 'public' })
  } catch (error) {
    log.error('Failed to copy friend poster to the new homepage host', { previousPath, targetPath, error })
    throw new DomainError('INTERNAL', descriptorFor('friends.error.posterMoveFailed'))
  }
  try {
    const moved = await updateImageStoragePath(db, source.id, targetPath)
    if (moved === null) {
      throw new Error('Image metadata disappeared during friend poster move')
    }
  } catch (error) {
    await backend.delete(targetPath).catch(() => undefined)
    log.error('Failed to update friend poster metadata after storage move', { previousPath, targetPath, error })
    throw new DomainError('INTERNAL', descriptorFor('friends.error.posterMoveFailed'))
  }
  await backend.delete(previousPath).catch((error) => {
    log.warn('Failed to remove the previous friend poster object after moving it', { previousPath, error })
  })
  return poster
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

export async function applyFriend(db: Database, input: ApplyFriendInputs): Promise<void> {
  const dup = await findFriendByHomepage(db, input.homepage)
  if (dup !== null) {
    throw new DomainError('CONFLICT', descriptorFor('friends.error.alreadyApplied'), [
      { ...descriptorFor('friends.error.homepageSubmitted'), path: ['homepage'] },
    ])
  }
  const row = await insertFriend(db, {
    website: input.website,
    description: normaliseNullable(input.description),
    homepage: input.homepage,
    poster: input.poster ?? '',
    rssUrl: normaliseNullable(input.rssUrl),
    visible: false,
  })
  fireAndForgetNotify(sendNewFriendApplication(row), log, 'friend application')
}

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
