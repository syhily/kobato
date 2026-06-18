import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import {
  readMeta,
  readManyMeta,
  resolveSrcToStoragePath,
  type CachedImageMeta,
} from '@/server/domains/images/services/cache'
import { getLogger } from '@/server/infra/logger'
import { getPublicBaseUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'

const log = getLogger('images.render-enhance')

export interface ImageThumbhashLookup {
  width: number
  height: number
  thumbhash?: string
  publicUrl: string | null
}

export async function loadImageThumbhash(db: NodePgDatabase, src: string): Promise<ImageThumbhashLookup | null> {
  if (src === '') {
    return null
  }

  let publicBaseUrl: string | null = null
  try {
    publicBaseUrl = getPublicBaseUrl()
  } catch {
    // Settings unconfigured — fall through; only `external` rows can resolve.
  }

  const storagePath = resolveSrcToStoragePath(src, publicBaseUrl)
  if (storagePath === null) {
    return null
  }

  let meta: CachedImageMeta
  try {
    meta = await readMeta(db, storagePath)
  } catch (error) {
    log.warn('Failed to resolve image metadata for cover', { src, error })
    return null
  }

  if (!meta.found) {
    return null
  }
  return {
    width: meta.width,
    height: meta.height,
    thumbhash: meta.thumbhash ?? undefined,
    publicUrl: safeResolveAssetUrl(meta.driver, meta.storagePath, meta.updatedAtMs),
  }
}

export interface ResolvedImageMeta {
  thumbhash?: string
  width?: number
  height?: number
}

export async function loadManyImageThumbhash(
  db: NodePgDatabase,
  urls: string[],
): Promise<Map<string, ImageThumbhashLookup>> {
  const out = new Map<string, ImageThumbhashLookup>()
  if (urls.length === 0) {
    return out
  }

  let publicBaseUrl: string | null = null
  try {
    publicBaseUrl = getPublicBaseUrl()
  } catch {
    // Settings unconfigured — fall through; only external rows can resolve.
  }

  const pathToUrl = new Map<string, string>()
  const uniquePaths: string[] = []
  for (const url of urls) {
    if (url === '') {
      continue
    }
    const storagePath = resolveSrcToStoragePath(url, publicBaseUrl)
    if (storagePath === null) {
      continue
    }
    if (!pathToUrl.has(storagePath)) {
      pathToUrl.set(storagePath, url)
      uniquePaths.push(storagePath)
    }
  }

  if (uniquePaths.length === 0) {
    return out
  }

  let metaMap: Map<string, CachedImageMeta>
  try {
    metaMap = await readManyMeta(db, uniquePaths)
  } catch (error) {
    log.warn('Failed to resolve image metadata batch; continuing without enhancement', { error })
    return out
  }

  for (const [storagePath, url] of pathToUrl) {
    const meta = metaMap.get(storagePath)
    if (meta === undefined || !meta.found) {
      continue
    }
    out.set(url, {
      width: meta.width,
      height: meta.height,
      thumbhash: meta.thumbhash ?? undefined,
      publicUrl: safeResolveAssetUrl(meta.driver, meta.storagePath, meta.updatedAtMs),
    })
  }

  return out
}
