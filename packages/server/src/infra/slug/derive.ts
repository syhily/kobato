import { Slugger } from '@kobato/shared/slug'
import { pinyin } from 'pinyin-pro'

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
