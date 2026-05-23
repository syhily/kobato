import { and, count, desc, eq, ilike, inArray, isNull, like, or, type SQL, sql } from 'drizzle-orm'

import type { ImageRow, NewImage } from '@/server/infra/db/types'

import { db } from '@/server/infra/db/pool'
import { image } from '@/server/infra/db/schema/media'
import { user } from '@/server/infra/db/schema/user'
import { escapeLikePattern } from '@/shared/utils/escape-like'

export interface AdminImagesListFilters {
  q?: string
  /**
   * Filter by `kind` derived from `storagePath` prefix. Accepts
   *   `'generic'`  → `storage_path NOT LIKE 'images/categories/%' AND
   *                   storage_path NOT LIKE 'images/links/%'`
   *   `'category'` → `storage_path LIKE 'images/categories/%'`
   *   `'friend'`   → `storage_path LIKE 'images/links/%'`
   *   `'all'` / undefined → no filter
   */
  kind?: 'generic' | 'category' | 'friend' | 'all'
  offset?: number
  limit?: number
  /**
   * Default `false`: list view hides soft-deleted rows. The trash bin
   * (a follow-up surface) flips this on.
   */
  includeDeleted?: boolean
}

/**
 * Row projection used by the admin list endpoint. The base columns
 * are projected verbatim from `image`, plus an `uploaderName` joined
 * from the `user` table so the table can render the uploader's
 * display name without an extra round-trip per row. `null` when the
 * row has no `uploaderId`, or when the referenced user has been
 * hard-deleted (the LEFT JOIN keeps the image visible in either case).
 */
export interface AdminImageRowWithUploader extends ImageRow {
  uploaderName: string | null
}

function buildAdminImageWhere(filters: AdminImagesListFilters): SQL | undefined {
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
      // generic = neither category nor friend prefix; column is NOT NULL
      // so the negation is safe without a NULL guard.
      const notCat = sql`${image.storagePath} NOT LIKE 'images/categories/%'`
      const notFriend = sql`${image.storagePath} NOT LIKE 'images/links/%'`
      conditions.push(notCat)
      conditions.push(notFriend)
    }
  }

  if (filters.q && filters.q.trim() !== '') {
    const pattern = `%${escapeLikePattern(filters.q.trim())}%`
    const search = or(ilike(image.storagePath, pattern), ilike(image.note, pattern))
    if (search) {
      conditions.push(search)
    }
  }

  if (conditions.length === 0) {
    return undefined
  }
  if (conditions.length === 1) {
    return conditions[0]
  }
  return and(...conditions)
}

// Column map shared by every admin-side `image LEFT JOIN user`
// projection (list view + single-row reads after a write). Centralised
// so the column set stays in lock-step across the three call sites
// without repeating the field list (and without paying for a
// `select(*)` that would otherwise drag the `password` column out of
// `user`).
const ADMIN_IMAGE_WITH_UPLOADER_COLUMNS = {
  id: image.id,
  createdAt: image.createdAt,
  updatedAt: image.updatedAt,
  deletedAt: image.deletedAt,
  storagePath: image.storagePath,
  mimeType: image.mimeType,
  width: image.width,
  height: image.height,
  byteSize: image.byteSize,
  thumbhash: image.thumbhash,
  uploaderId: image.uploaderId,
  note: image.note,
  uploaderName: user.name,
} as const

export async function listAdminImageRows(filters: AdminImagesListFilters = {}): Promise<AdminImageRowWithUploader[]> {
  const where = buildAdminImageWhere(filters)
  // LEFT JOIN on `user` so a hard-deleted uploader row (or a NULL
  // `uploader_id` on legacy rows) does not hide the image from the
  // admin library. `uploaderName` is the user's display name when
  // present, `null` otherwise.
  const baseQuery = db
    .select(ADMIN_IMAGE_WITH_UPLOADER_COLUMNS)
    .from(image)
    .leftJoin(user, eq(user.id, image.uploaderId))

  let q = where ? baseQuery.where(where).orderBy(desc(image.createdAt)) : baseQuery.orderBy(desc(image.createdAt))
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

/**
 * Single-row variant of `listAdminImageRows` keyed by `id`. Used by
 * the post-mutation paths in `@/server/domains/images/service` so the admin
 * shell can patch the row in place without a second `SELECT user`
 * round-trip after `updateImageNote()` / `findImageDtoById()`.
 */
export async function findAdminImageRowById(id: bigint): Promise<AdminImageRowWithUploader | null> {
  const rows = await db
    .select(ADMIN_IMAGE_WITH_UPLOADER_COLUMNS)
    .from(image)
    .leftJoin(user, eq(user.id, image.uploaderId))
    .where(eq(image.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function countAdminImages(filters: AdminImagesListFilters = {}): Promise<number> {
  const where = buildAdminImageWhere(filters)
  const rows = where
    ? await db.select({ value: count() }).from(image).where(where)
    : await db.select({ value: count() }).from(image)
  return rows[0]?.value ?? 0
}

export async function findImageById(id: bigint): Promise<ImageRow | null> {
  const rows = await db.select().from(image).where(eq(image.id, id)).limit(1)
  return rows[0] ?? null
}

export async function findImageByStoragePath(storagePath: string): Promise<ImageRow | null> {
  const rows = await db.select().from(image).where(eq(image.storagePath, storagePath)).limit(1)
  return rows[0] ?? null
}

/** Batch-fetch by `storagePath`. Skips empty input arrays to avoid `IN ()` syntax errors. */
export async function findImagesByStoragePaths(paths: readonly string[]): Promise<ImageRow[]> {
  if (paths.length === 0) {
    return []
  }
  return db
    .select()
    .from(image)
    .where(and(inArray(image.storagePath, [...paths]), isNull(image.deletedAt)))
}

export async function insertImage(values: NewImage): Promise<ImageRow> {
  const now = new Date()
  const rows = await db
    .insert(image)
    .values({ ...values, createdAt: now, updatedAt: now })
    .returning()
  return rows[0]
}

/**
 * Idempotent insert for the one-shot historical import. Returns
 * `null` when the row was skipped because `storage_path` already
 * exists, so the importer can report `inserted` vs `skipped` counts.
 */
export async function insertImageIfMissing(values: NewImage): Promise<ImageRow | null> {
  const now = new Date()
  const rows = await db
    .insert(image)
    .values({ ...values, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: image.storagePath })
    .returning()
  return rows[0] ?? null
}

/**
 * Insert if `storage_path` is new, otherwise UPDATE the existing row.
 * Always clears `deleted_at` so re-uploading after a soft-delete
 * resurrects the row instead of carrying the tombstone forward.
 */
export async function upsertImageByStoragePath(values: NewImage): Promise<ImageRow> {
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

export async function softDeleteImage(id: bigint): Promise<ImageRow | null> {
  const rows = await db
    .update(image)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(image.id, id))
    .returning()
  return rows[0] ?? null
}

export async function updateImageNote(id: bigint, note: string | null): Promise<ImageRow | null> {
  const rows = await db
    .update(image)
    .set({ note: note?.trim() === '' ? null : note, updatedAt: new Date() })
    .where(eq(image.id, id))
    .returning()
  return rows[0] ?? null
}

/**
 * UPDATE the row's `note` and re-read it joined with `user` so the
 * admin shell receives the full DTO (including `uploaderName`) in
 * one helper call. PG's `UPDATE ... RETURNING` does not support
 * `JOIN`, so we issue the read as a follow-up SELECT against the
 * same shared pool; the two statements are tiny and indexed (PK
 * lookup + FK lookup) and live behind the same query helper so
 * service code stays single-call.
 */
export async function updateImageNoteWithUploader(
  id: bigint,
  note: string | null,
): Promise<AdminImageRowWithUploader | null> {
  const updated = await updateImageNote(id, note)
  if (updated === null) {
    return null
  }
  return findAdminImageRowById(id)
}

export async function updateImageThumbhash(id: bigint, thumbhash: string): Promise<ImageRow | null> {
  const rows = await db.update(image).set({ thumbhash, updatedAt: new Date() }).where(eq(image.id, id)).returning()
  return rows[0] ?? null
}

/**
 * UPDATE the row's `thumbhash` and re-read it joined with `user` so the
 * admin shell receives the full DTO in one helper call.
 */
export async function updateImageThumbhashWithUploader(
  id: bigint,
  thumbhash: string,
): Promise<AdminImageRowWithUploader | null> {
  const updated = await updateImageThumbhash(id, thumbhash)
  if (updated === null) {
    return null
  }
  return findAdminImageRowById(id)
}
