// Render-enhance projections over the image-meta pipeline in `./resolve`:
// `resolveImageMetaBySources` shapes meta for Portable Text image blocks
// (sparse dims + thumbhash, no public URL — the block keeps its own src),
// `hydrateImageRefs` rewrites cover/poster fields on list DTOs.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { ResolvedImageMeta } from '@/shared/types/images'

import { resolveImageRefs, type ResolvedImageRef } from '@/server/domains/images/services/resolve'

export async function resolveImageMetaBySources(
  db: NodePgDatabase,
  links: string[],
): Promise<Map<string, ResolvedImageMeta>> {
  const refs = await resolveImageRefs(db, links)
  const out = new Map<string, ResolvedImageMeta>()
  for (const [src, ref] of refs) {
    const meta: ResolvedImageMeta = { width: ref.width, height: ref.height }
    if (ref.thumbhash !== undefined && ref.thumbhash !== '') {
      meta.thumbhash = ref.thumbhash
    }
    out.set(src, meta)
  }
  return out
}

export async function hydrateImageRefs<T>(
  db: NodePgDatabase,
  items: T[],
  getUrl: (item: T) => string,
  apply: (item: T, lookup: ResolvedImageRef | null) => void,
): Promise<void> {
  const uniqueUrls = [...new Set(items.map(getUrl).filter((url) => url !== ''))]
  const lookupMap = await resolveImageRefs(db, uniqueUrls)
  for (const item of items) {
    const url = getUrl(item)
    apply(item, url === '' ? null : (lookupMap.get(url) ?? null))
  }
}
