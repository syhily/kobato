import type { Database } from '@/server/infra/db/database'
import type { ImageRow } from '@/server/infra/db/types'
import type { AdminImageDto, ListImagesOutput } from '@/shared/contracts/images'
import type { ListImagesInput } from '@/shared/types/images'

import { type AdminImagesListFilters, countAdminImages, listAdminImageRows } from '@/server/infra/db/operations/image'
import { safeResolveAssetUrl } from '@/server/infra/storage/public-url'
import { classifyImageKind } from '@/shared/types/images'

export async function listImagesForAdmin(db: Database, input: ListImagesInput = {}): Promise<ListImagesOutput> {
  const offset = clampOffset(input.offset)
  const limit = clampLimit(input.limit)

  const filters: AdminImagesListFilters = {
    q: input.q,
    kind: input.kind,
    offset,
    limit,
  }

  const [rows, total] = await Promise.all([
    listAdminImageRows(db, filters),
    countAdminImages(db, { q: input.q, kind: input.kind }),
  ])

  return {
    images: rows.map((row) => toAdminImageDto(row, row.uploaderName)),
    total,
    hasMore: offset + rows.length < total,
  }
}

export function toAdminImageDto(row: ImageRow, uploaderName: string | null): AdminImageDto {
  return {
    id: String(row.id),
    kind: classifyImageKind(row.storagePath),
    storagePath: row.storagePath,
    publicUrl: resolvePublicUrl(row),
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    byteSize: row.byteSize,
    thumbhash: row.thumbhash ?? null,
    uploaderId: row.uploaderId === null ? null : String(row.uploaderId),
    uploaderName,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function resolvePublicUrl(row: ImageRow): string {
  return safeResolveAssetUrl(row.storageDriver, row.storagePath, row.updatedAt.getTime()) ?? row.storagePath
}

function clampOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.floor(value)
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return 20
  }
  if (value > 200) {
    return 200
  }
  return Math.floor(value)
}
