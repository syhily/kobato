import { SLUG_CHAR_MAP } from '@/shared/slug-char-map'

// Matches `makeSlug` / `deriveSlug` output one-for-one.
export const DERIVED_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Matches the per-table slug column limits (`tag.slug`, `category.slug`, `pageMeta.slug`).
export const SLUG_MAX = 80

const REMOVE_PATTERN = /[^\p{L}\p{N}\s-]+/gu

function makeSlug(text: string): string {
  let mapped = ''
  for (const ch of text.normalize()) {
    const substituted = SLUG_CHAR_MAP[ch] ?? ch
    mapped += substituted === '-' ? ' ' : substituted
  }
  return mapped.replace(REMOVE_PATTERN, '').trim().replace(/\s+/g, '-').toLowerCase()
}

export class Slugger {
  private readonly seen = new Set<string>()

  slug(text: string): string {
    let base = makeSlug(text)
    if (!base) {
      return ''
    }

    let result = base
    let count = 0
    while (this.seen.has(result)) {
      count += 1
      result = `${base}-${count}`
    }
    this.seen.add(result)
    return result
  }
}
