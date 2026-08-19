import { and, count, desc, eq, inArray, isNull, like, or, type SQL, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { ImageRow, NewImage } from '@/server/infra/db/types'

import { likeEscape } from '@/server/infra/db/like-escape'
import { applyPage, assembleWhere, withUploader } from '@/server/infra/db/operations/admin-list'
import { image } from '@/server/infra/db/schema/media'

export interface AdminImagesListFilters {
  q?: string
  /**
   * Filter by `kind` derived from `storagePath` prefix: `'category'` /
   * `'friend'` match their prefix, `'generic'` is the negation of both.
   */
  kind?: 'generic' | 'category' | 'friend' | 'all'
  offset?: number
  limit?: number
  /** Default `false`: list view hides soft-deleted rows. */
  includeDeleted?: boolean
}

/**
 * Admin list projection: `image` columns plus `uploaderName` via LEFT
 * JOIN `user`; null when the row has no uploader or the user was deleted.
 */
export interface AdminImageRowWithUploader extends ImageRow {
  uploaderName: string | null
}

function buildAdminImageConditions(filters: AdminImagesListFilters): SQL[] {
  const conditions: SQL[] = []

  if (!filters.includeDeleted) {
    conditions.push(isNull(image.deletedAt))
  }

  if (filters.kind !== undefined && filters.kind !== 'all') {
    if (filters.kind === 'category') {
      conditions.push(like(image.storagePath, 'images/categories/%'))
    } else if (filters.kind === 'friend') {
      conditions.push(like(image.storagePath, 'images/links/%'))
    } else {
      // generic = neither prefix; storage_path is NOT NULL, so no NULL guard needed.
      const notCat = sql`${image.storagePath} NOT LIKE 'images/categories/%'`
      const notFriend = sql`${image.storagePath} NOT LIKE 'images/links/%'`
      conditions.push(notCat)
      conditions.push(notFriend)
    }
  }

  if (filters.q && filters.q.trim() !== '') {
    const q = filters.q.trim()
    const search = or(likeEscape(image.storagePath, q), likeEscape(image.note, q))
    if (search) {
      conditions.push(search)
    }
  }

  return conditions
}

const imageUploader = withUploader({
  table: image,
  idColumn: image.id,
  uploaderIdColumn: image.uploaderId,
  columns: {
    id: image.id,
    createdAt: image.createdAt,
    updatedAt: image.updatedAt,
    deletedAt: image.deletedAt,
    storagePath: image.storagePath,
    storageDriver: image.storageDriver,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
    thumbhash: image.thumbhash,
    uploaderId: image.uploaderId,
    note: image.note,
  },
})

export async function listAdminImageRows(
  db: Database,
  filters: AdminImagesListFilters = {},
): Promise<AdminImageRowWithUploader[]> {
  const where = assembleWhere(buildAdminImageConditions(filters))
  const baseQuery = imageUploader.selectJoined(db)
  const q = where ? baseQuery.where(where).orderBy(desc(image.createdAt)) : baseQuery.orderBy(desc(image.createdAt))
  return applyPage(q, filters)
}

/** Single-row variant of `listAdminImageRows` keyed by `id`; used by the post-mutation paths. */
export async function findAdminImageRowById(db: Database, id: number): Promise<AdminImageRowWithUploader | null> {
  return imageUploader.findJoinedRowById(db, id)
}

export async function countAdminImages(db: Database, filters: AdminImagesListFilters = {}): Promise<number> {
  const where = assembleWhere(buildAdminImageConditions(filters))
  const rows = where
    ? await db.select({ value: count() }).from(image).where(where)
    : await db.select({ value: count() }).from(image)
  return rows[0]?.value ?? 0
}

export async function findImageById(db: Database, id: number): Promise<ImageRow | null> {
  const rows = await db.select().from(image).where(eq(image.id, id)).limit(1)
  return rows[0] ?? null
}

/** Skips empty input arrays to avoid `IN ()` syntax errors. */
export async function findImagesByIds(db: Database, ids: readonly number[]): Promise<ImageRow[]> {
  if (ids.length === 0) {
    return []
  }
  return db
    .select()
    .from(image)
    .where(inArray(image.id, [...ids]))
}

/** Skips empty input arrays to avoid `IN ()` syntax errors. */
export async function findImagesByStoragePaths(db: Database, paths: readonly string[]): Promise<ImageRow[]> {
  if (paths.length === 0) {
    return []
  }
  return db
    .select()
    .from(image)
    .where(and(inArray(image.storagePath, [...paths]), isNull(image.deletedAt)))
}

export async function insertImage(db: Database, values: NewImage): Promise<ImageRow> {
  const now = new Date()
  const rows = await db
    .insert(image)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

/** Always clears `deleted_at` so a re-upload resurrects a soft-deleted row. */
export async function upsertImageByStoragePath(db: Database, values: NewImage): Promise<ImageRow> {
  const now = new Date()
  const rows = await db
    .insert(image)
    .values({ ...values, createdAt: now, updatedAt: now, deletedAt: null })
    .onConflictDoUpdate({
      target: image.storagePath,
      set: {
        mimeType: values.mimeType,
        width: values.width,
        height: values.height,
        byteSize: values.byteSize,
        thumbhash: values.thumbhash ?? null,
        uploaderId: values.uploaderId ?? null,
        note: values.note ?? null,
        updatedAt: now,
        deletedAt: null,
      },
    })
    .returning()
  return rows[0]
}

export async function softDeleteImage(db: Database, id: number): Promise<ImageRow | null> {
  const rows = await db
    .update(image)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(image.id, id))
    .returning()
  return rows[0] ?? null
}

export async function updateImageNote(db: Database, id: number, note: string | null): Promise<ImageRow | null> {
  const rows = await db
    .update(image)
    .set({ note: note?.trim() === '' ? null : note, updatedAt: new Date() })
    .where(eq(image.id, id))
    .returning()
  return rows[0] ?? null
}

/** Re-reads joined with `user` so the admin shell gets the full DTO in one call. */
export async function updateImageNoteWithUploader(
  db: Database,
  id: number,
  note: string | null,
): Promise<AdminImageRowWithUploader | null> {
  return imageUploader.updateThenRefetch(db, id, (d, rowId) => updateImageNote(d, rowId, note))
}

export async function updateImageThumbhash(db: Database, id: number, thumbhash: string): Promise<ImageRow | null> {
  const rows = await db.update(image).set({ thumbhash, updatedAt: new Date() }).where(eq(image.id, id)).returning()
  return rows[0] ?? null
}

/** Re-reads joined with `user` so the admin shell gets the full DTO in one call. */
export async function updateImageThumbhashWithUploader(
  db: Database,
  id: number,
  thumbhash: string,
): Promise<AdminImageRowWithUploader | null> {
  return imageUploader.updateThenRefetch(db, id, (d, rowId) => updateImageThumbhash(d, rowId, thumbhash))
}
