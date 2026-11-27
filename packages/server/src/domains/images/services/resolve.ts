import type { Database } from '@kobato/db/sqlite/database'
import type { ImageRow } from '@kobato/db/sqlite/types'
import type { StorageDriver } from '@kobato/settings/types'

import { STORAGE_ROUTE_PREFIX } from '@kobato/base/assets/asset-url'
import { findImagesByStoragePaths } from '@kobato/db/sqlite/operations/content/image'
import { getLogger } from '@kobato/server/infra/logger'
import { getPublicBaseUrl, parseAssetUrl, safeResolveAssetUrl } from '@kobato/server/infra/storage/public-url'

const log = getLogger('images.render-enhance')

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

function rowToMeta(row: ImageRow): CachedImageMetaPresent {
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
  const rows = await findImagesByStoragePaths(db, storagePaths)
  const rowMap = new Map(rows.map((row) => [row.storagePath, row]))
  for (const storagePath of storagePaths) {
    const row = rowMap.get(storagePath)
    out.set(storagePath, row !== undefined ? rowToMeta(row) : { found: false })
  }
  return out
}

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
      if (pathname.startsWith('/images/')) {
        return normalizeStoragePath(pathname.slice(1))
      }
    } catch {}
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

export interface ResolvedImageRef {
  width: number
  height: number
  thumbhash?: string
  publicUrl: string | null
}

export async function resolveImageRefs(db: Database, urls: string[]): Promise<Map<string, ResolvedImageRef>> {
  const out = new Map<string, ResolvedImageRef>()
  if (urls.length === 0) {
    return out
  }

  const publicBaseUrl = readPublicBaseUrl()

  const urlToPath = new Map<string, string>()
  for (const url of urls) {
    if (url === '' || urlToPath.has(url)) {
      continue
    }
    const storagePath = resolveSrcToStoragePath(url, publicBaseUrl)
    if (storagePath !== null) {
      urlToPath.set(url, storagePath)
    }
  }
  if (urlToPath.size === 0) {
    return out
  }

  let metaMap: Map<string, CachedImageMeta>
  try {
    metaMap = await readManyMeta(db, [...new Set(urlToPath.values())])
  } catch (error) {
    log.warn('Failed to resolve image metadata batch; continuing without enhancement', { error })
    return out
  }

  for (const [url, storagePath] of urlToPath) {
    const meta = metaMap.get(storagePath)
    if (meta === undefined || !meta.found) {
      continue
    }
    out.set(url, {
      width: meta.width,
      height: meta.height,
      thumbhash: meta.thumbhash ?? undefined,
      publicUrl: safeResolveAssetUrl(meta.storagePath, meta.updatedAtMs),
    })
  }
  return out
}

export async function resolveImageRef(db: Database, src: string): Promise<ResolvedImageRef | null> {
  if (src === '') {
    return null
  }
  const resolved = await resolveImageRefs(db, [src])
  return resolved.get(src) ?? null
}

function readPublicBaseUrl(): string | null {
  try {
    return getPublicBaseUrl()
  } catch {
    return null
  }
}
