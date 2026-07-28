// Single owner of the "image URL(s) → stored meta" pipeline: match each URL
// against the configured CDN base, read the cached image rows, and hand back
// dimensions / thumbhash / public URL per resolvable URL. `resolveImageRefs`
// is the batch entry; `resolveImageRef` a thin single-URL wrapper.
//
// Base-URL policy: every caller is a best-effort render surface, so an
// unreadable settings snapshot degrades the CDN match to `null` —
// origin-relative `/storage/…` and `/images/…` srcs still resolve — and
// never fails the render.

import type { Database } from '@/server/infra/db/database'

import { readManyMeta, resolveSrcToStoragePath, type CachedImageMeta } from '@/server/domains/images/services/cache'
import { getLogger } from '@/server/infra/logger'
import { getPublicBaseUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'

const log = getLogger('images.render-enhance')

/** Stored metadata resolved for one image URL. */
export interface ResolvedImageRef {
  width: number
  height: number
  thumbhash?: string
  /** Absolute URL the asset is publicly served from; null when unresolvable. */
  publicUrl: string | null
}

/**
 * Batch entry. Every distinct URL string gets its own entry, even when
 * several URLs (e.g. transform variants `x.jpg!w400`) share one storage
 * path — the path is read once either way.
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
      publicUrl: safeResolveAssetUrl(meta.driver, meta.storagePath, meta.updatedAtMs),
    })
  }
  return out
}

/** Single-URL entry over the batch pipeline. */
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
