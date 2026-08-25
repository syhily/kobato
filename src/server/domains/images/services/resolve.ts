// Single owner of the "image URL(s) → stored meta" pipeline. Best-effort:
// unreadable settings degrade the CDN match to `null` (origin-relative
// `/storage/…` and `/images/…` srcs still resolve) — never fails the render.

import type { Database } from '@/server/infra/db/database'

import { readManyMeta, resolveSrcToStoragePath, type CachedImageMeta } from '@/server/domains/images/services/cache'
import { getLogger } from '@/server/infra/logger'
import { getPublicBaseUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'

const log = getLogger('images.render-enhance')

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
