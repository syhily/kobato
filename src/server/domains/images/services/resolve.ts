// Single owner of the "image URL(s) → stored meta" pipeline. Meta reads go
// straight to SQLite (an indexed `storage_path IN (...)` lookup — the remote-DB
// cache tier was retired); unreadable settings degrade the CDN match to `null`
// (origin-relative `/storage/…` and `/images/…` srcs still resolve) — never
// fails the render.

import type { Database } from '@/server/infra/db/database'
import type { ImageRow } from '@/server/infra/db/types'
import type { StorageDriver } from '@/shared/config/types'

import { findImagesByStoragePaths } from '@/server/infra/db/operations/image'
import { getLogger } from '@/server/infra/logger'
import { getPublicBaseUrl, parseAssetUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'
import { STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'

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

export interface ResolvedImageRef {
  width: number
  height: number
  thumbhash?: string
  /** Absolute URL the asset is publicly served from; null when unresolvable. */
  publicUrl: string | null
}

/**
 * Batch entry. Result map is keyed by distinct URL; URLs sharing one
 * storage path (transform variants) are read once.
 */
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
    // Settings unreadable — see the module header for the policy.
    return null
  }
}
