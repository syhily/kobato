import { pinyin } from 'pinyin-pro'

import { DERIVED_SLUG_PATTERN, SLUG_MAX, Slugger } from '@/shared/slug'

// Canonical slug helper: `pinyin-pro` → `Slugger`.
// Fresh slugger per call (stateless); callers that need dedup keep their own instance.
// Lives in `server/` because `pinyin-pro` is ~150 KB and must not reach the client.
export function deriveSlug(text: string): string {
  const romanised = pinyin(text, {
    toneType: 'none',
    separator: ' ',
    nonZh: 'consecutive',
  })
  const collapsedSpaces = romanised.replace(/\s+/g, ' ').trim()
  const slugged = new Slugger().slug(collapsedSpaces)
  return slugged.replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export { DERIVED_SLUG_PATTERN, SLUG_MAX }
