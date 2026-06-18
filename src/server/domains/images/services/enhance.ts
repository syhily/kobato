import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import {
  readManyMeta,
  resolvePublicUrl,
  resolveSrcToStoragePath,
  type CachedImageMetaPresent,
  type CachedImageMeta,
} from '@/server/domains/images/services/cache'
import { loadManyImageThumbhash, type ImageThumbhashLookup } from '@/server/domains/images/services/cover'
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'

const log = getLogger('images.render-enhance')

interface ImageEnhancement {
  width: number
  height: number
  thumbhash: string | null
  publicUrl: string
}

interface ResolvedSrc {
  src: string
  storagePath: string
}

async function resolveSources(db: NodePgDatabase, links: string[]): Promise<Map<string, ImageEnhancement>> {
  const out = new Map<string, ImageEnhancement>()

  let publicBaseUrl: string | null = null
  try {
    publicBaseUrl = getPublicBaseUrl()
  } catch (error) {
    if (!(error instanceof ActionFailure) && !(error instanceof Error && /missing|hydrated/.test(error.message))) {
      throw error
    }
  }

  const candidates: ResolvedSrc[] = []
  for (const src of links) {
    const storagePath = resolveSrcToStoragePath(src, publicBaseUrl)
    if (storagePath === null) {
      continue
    }
    candidates.push({ src, storagePath })
  }

  if (candidates.length === 0) {
    return out
  }

  let cached: Map<string, CachedImageMeta>
  try {
    cached = await readManyMeta(
      db,
      candidates.map((c) => c.storagePath),
    )
  } catch (error) {
    log.warn('Failed to resolve image metadata; rendering naked images', { error })
    return out
  }

  for (const { src, storagePath } of candidates) {
    const meta = cached.get(storagePath)
    if (meta === undefined || !meta.found) {
      continue
    }
    out.set(src, toEnhancement(meta))
  }

  return out
}

function toEnhancement(meta: CachedImageMetaPresent): ImageEnhancement {
  return {
    width: meta.width,
    height: meta.height,
    thumbhash: meta.thumbhash,
    publicUrl: resolvePublicUrl(meta),
  }
}

export interface ResolvedImageMeta {
  thumbhash?: string
  width?: number
  height?: number
}

export async function resolveImageMetaBySources(
  db: NodePgDatabase,
  links: string[],
): Promise<Map<string, ResolvedImageMeta>> {
  const enhancements = await resolveSources(db, links)
  const out = new Map<string, ResolvedImageMeta>()
  for (const [src, enhancement] of enhancements) {
    const meta: ResolvedImageMeta = {}
    if (enhancement.thumbhash !== null && enhancement.thumbhash !== '') {
      meta.thumbhash = enhancement.thumbhash
    }
    meta.width = enhancement.width
    meta.height = enhancement.height
    out.set(src, meta)
  }
  return out
}

export async function hydrateImageRefs<T>(
  db: NodePgDatabase,
  items: T[],
  getUrl: (item: T) => string,
  apply: (item: T, lookup: ImageThumbhashLookup | null) => void,
): Promise<void> {
  const uniqueUrls = [...new Set(items.map(getUrl).filter((url) => url !== ''))]
  const lookupMap = await loadManyImageThumbhash(db, uniqueUrls)
  for (const item of items) {
    const url = getUrl(item)
    const lookup = url === '' ? null : (lookupMap.get(url) ?? null)
    apply(item, lookup)
  }
}

export { resolveSrcToStoragePath }
