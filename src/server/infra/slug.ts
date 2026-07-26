import { pinyin } from 'pinyin-pro'

import { DomainError } from '@/server/infra/http/errors'
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

// Canonical slug resolution for a taxonomy entity. An explicit non-empty
// value wins; blank / missing falls back to `deriveSlug(name)`. Throws
// 400 when even `deriveSlug` produces an empty string (e.g. a name made
// entirely of emoji / punctuation).
export function resolveSlugForTaxonomy(explicit: string | undefined, name: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    const slug = explicit.trim()
    if (!DERIVED_SLUG_PATTERN.test(slug)) {
      throw new DomainError('BAD_REQUEST', 'slug 格式不合法（仅允许小写字母、数字、`-`）。', [
        { message: 'slug 格式不合法', path: ['slug'] },
      ])
    }
    if (slug.length > SLUG_MAX) {
      throw new DomainError('BAD_REQUEST', `slug 长度不得超过 ${SLUG_MAX} 个字符。`, [
        { message: `slug 长度不得超过 ${SLUG_MAX} 个字符`, path: ['slug'] },
      ])
    }
    return slug
  }
  const derived = deriveSlug(name)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从名称推导出 slug，请手动填写。', [
      { message: '名称推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}
