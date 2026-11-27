import type { ResolvedImageMeta } from '@kobato/base/assets/images'
import type { Database } from '@kobato/db/sqlite/database'

import { resolveImageRefs, type ResolvedImageRef } from '@kobato/server/domains/images/services/resolve'

export async function resolveImageMetaBySources(
  db: Database,
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
  db: Database,
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
