import type { Database } from '@/server/infra/db/database'
import type { ImageRow } from '@/server/infra/db/types'
import type { StorageDriver } from '@/shared/config/types'

import { remove, throughMany } from '@/server/infra/cache/registry'
import { findImagesByStoragePaths } from '@/server/infra/db/operations/image'
import { parseAssetUrl } from '@/server/infra/storage/public-url'
import { STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'

export interface CachedImageMetaPresent {
  found: true
  storagePath: string
  driver: StorageDriver
  width: number
  height: number
  thumbhash: string | null
  updatedAtMs: number
}

export interface CachedImageMetaMissing {
  found: false
}

export type CachedImageMeta = CachedImageMetaPresent | CachedImageMetaMissing

function rowToCached(row: ImageRow): CachedImageMetaPresent {
  return {
    found: true,
    storagePath: row.storagePath,
    driver: row.storageDriver,
    width: row.width,
    height: row.height,
    thumbhash: row.thumbhash,
    updatedAtMs: row.updatedAt.getTime(),
  }
}

export async function readManyMeta(db: Database, storagePaths: string[]): Promise<Map<string, CachedImageMeta>> {
  const out = new Map<string, CachedImageMeta>()
  if (storagePaths.length === 0) {
    return out
  }

  const results = await throughMany(
    db,
    'imageMeta',
    storagePaths.map((storagePath) => ({ storagePath })),
    async (missing) => {
      const rows = await findImagesByStoragePaths(
        db,
        missing.map((params) => params.storagePath),
      )
      const rowMap = new Map(rows.map((row) => [row.storagePath, row]))
      return missing.map((params) => {
        const row = rowMap.get(params.storagePath)
        return { params, value: row !== undefined ? rowToCached(row) : ({ found: false } as CachedImageMeta) }
      })
    },
  )

  for (const { params, value } of results) {
    if (value !== null) {
      out.set(params.storagePath, value)
    }
  }
  return out
}

export async function invalidateImageEnhanceCacheFor(db: Database, storagePath: string): Promise<void> {
  await remove(db, 'imageMeta', { storagePath })
}

/**
 * Image src → storage key. The site-owned core (`/storage/<key>`, relative or
 * absolute) is `parseAssetUrl`; this matcher deliberately accepts MORE legacy
 * width around it: CDN-base-absolute keys, the bare `images/…`/`storage/…`
 * and `/images/…` forms, `!` transform suffixes, and any-origin absolutes
 * (domain moves). Embedded-font URLs never resolve to image rows.
 */
export function resolveSrcToStoragePath(src: string, publicBaseUrl: string | null): string | null {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    if (publicBaseUrl !== null) {
      if (src.startsWith(`${publicBaseUrl}/`)) {
        return normalizeStoragePath(src.slice(publicBaseUrl.length + 1))
      }
      if (src === publicBaseUrl) {
        return ''
      }
    }
    const parsed = parseAssetUrl(src, { anyOrigin: true })
    if (parsed !== null) {
      return parsed.route === STORAGE_ROUTE_PREFIX ? normalizeStoragePath(parsed.key) : null
    }
    try {
      const pathname = new URL(src).pathname
      // Legacy absolute form: local-served assets under `/images/<key>`.
      if (pathname.startsWith('/images/')) {
        return normalizeStoragePath(pathname.slice(1))
      }
    } catch {
      // Malformed URL — fall through to "no match".
    }
    return null
  }
  const parsed = parseAssetUrl(src)
  if (parsed !== null) {
    return parsed.route === STORAGE_ROUTE_PREFIX ? normalizeStoragePath(parsed.key) : null
  }
  if (src.startsWith('storage/')) {
    return normalizeStoragePath(src.slice('storage/'.length))
  }
  if (src.startsWith('/images/')) {
    return normalizeStoragePath(src.slice(1))
  }
  if (src.startsWith('images/')) {
    return normalizeStoragePath(src)
  }
  return null
}

function normalizeStoragePath(storagePath: string): string {
  const bangIndex = storagePath.indexOf('!')
  const withoutTransform = bangIndex >= 0 ? storagePath.slice(0, bangIndex) : storagePath
  return withoutTransform
}
