import { Slugger } from '@kobato/shared/slug.ts'
import { pinyin } from 'pinyin-pro'

// Server-only (`pinyin-pro` must not reach the client); fresh Slugger per call.
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
