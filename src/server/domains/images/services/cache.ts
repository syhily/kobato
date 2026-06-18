import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ImageRow } from '@/server/infra/db/types'
import type { StorageDriver } from '@/shared/config/types'

import { findImagesByStoragePaths } from '@/server/infra/db/operations/image'
import { getLogger } from '@/server/infra/logger'
import { createInflight } from '@/server/infra/redis/inflight'
import { storage } from '@/server/infra/redis/storage'
import { resolveAssetUrl } from '@/server/infra/storage/public-url'
import { getCacheSettings } from '@/shared/config/getters'

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

function bucket(): { prefix: string; ttlSeconds: number } {
  return getCacheSettings().cache.imageMeta
}

function cacheKey(storagePath: string): string {
  return `${bucket().prefix}${storagePath}`
}

const inflight = createInflight<CachedImageMeta>()

export async function readMeta(db: NodePgDatabase, storagePath: string): Promise<CachedImageMeta> {
  return inflight(storagePath, async () => {
    const cached = await storage.getItem<CachedImageMeta>(cacheKey(storagePath))
    if (cached !== null) {
      return cached
    }
    const rows = await findImagesByStoragePaths(db, [storagePath])
    const row = rows[0] ?? null
    const value: CachedImageMeta = row !== null ? rowToCached(row) : { found: false }
    try {
      await storage.setItem(cacheKey(storagePath), value, { ttl: bucket().ttlSeconds })
    } catch (error) {
      log.warn('Failed to write image-meta cache; continuing without warmth', {
        storagePath,
        error,
      })
    }
    return value
  })
}

export async function readManyMeta(db: NodePgDatabase, storagePaths: string[]): Promise<Map<string, CachedImageMeta>> {
  const out = new Map<string, CachedImageMeta>()
  if (storagePaths.length === 0) {
    return out
  }

  const { prefix, ttlSeconds } = bucket()
  const keyToPath = new Map<string, string>()
  for (const storagePath of storagePaths) {
    keyToPath.set(`${prefix}${storagePath}`, storagePath)
  }
  const cacheEntries = await storage.getItems<CachedImageMeta>([...keyToPath.keys()])

  const missingPaths: string[] = []
  for (const entry of cacheEntries) {
    const storagePath = keyToPath.get(entry.key)!
    if (entry.value !== null) {
      out.set(storagePath, entry.value)
    } else {
      missingPaths.push(storagePath)
    }
  }

  if (missingPaths.length > 0) {
    const rows = await findImagesByStoragePaths(db, missingPaths)
    const rowMap = new Map(rows.map((r) => [r.storagePath, r]))

    const toWrite: { key: string; value: CachedImageMeta }[] = []
    for (const storagePath of missingPaths) {
      const row = rowMap.get(storagePath)
      const value: CachedImageMeta = row !== undefined ? rowToCached(row) : { found: false }
      out.set(storagePath, value)
      toWrite.push({ key: `${prefix}${storagePath}`, value })
    }

    await Promise.all(
      toWrite.map(async ({ key, value }) => {
        try {
          await storage.setItem(key, value, { ttl: ttlSeconds })
        } catch (error) {
          log.warn('Failed to write image-meta cache; continuing without warmth', { key, error })
        }
      }),
    )
  }

  return out
}

export async function invalidateImageEnhanceCacheFor(storagePath: string): Promise<void> {
  try {
    await storage.removeItem(cacheKey(storagePath))
  } catch (error) {
    log.warn('Failed to invalidate image-meta cache key', { storagePath, error })
  }
}

export async function clearImageEnhanceCache(): Promise<void> {
  const prefix = bucket().prefix
  const keys = await storage.getKeys(prefix)
  await Promise.all(
    keys.map(async (key) => {
      try {
        await storage.removeItem(key)
      } catch (error) {
        log.warn('Failed to clear image-meta key', { key, error })
      }
    }),
  )
}

/**
 * Resolve the public URL for a cached image meta. Dispatches on the
 * per-asset `driver` via the central `resolveAssetUrl` (S3 → CDN,
 * local → `/storage/*`), appending the `?v=<updatedAtMs>` cache buster.
 */
export function resolvePublicUrl(meta: CachedImageMetaPresent): string {
  return resolveAssetUrl(meta.driver, meta.storagePath, meta.updatedAtMs)
}

/**
 * Build a public URL from a bare storage path + driver (no cache buster).
 * Used by the admin list DTO. Throws `ActionFailure(503)` for an S3 asset
 * when the CDN base is unset.
 */
export function buildPublicUrl(storagePath: string, driver: StorageDriver): string {
  return resolveAssetUrl(driver, storagePath)
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
    try {
      const url = new URL(src)
      // Local-served assets live under `/storage/<key>` on the blog origin.
      if (url.pathname.startsWith('/storage/')) {
        return normalizeStoragePath(url.pathname.slice('/storage/'.length))
      }
      if (url.pathname.startsWith('/images/')) {
        return normalizeStoragePath(url.pathname.slice(1))
      }
    } catch {
      // Malformed URL — fall through to "no match".
    }
    return null
  }
  if (src.startsWith('/storage/')) {
    return normalizeStoragePath(src.slice('/storage/'.length))
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
