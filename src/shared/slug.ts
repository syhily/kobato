import { SLUG_CHAR_MAP } from '@/shared/slug-char-map'

// Isomorphic slug constants. The regex matches `makeSlug` / `deriveSlug`
// output one-for-one: lowercase ASCII alphanumerics + `-`, no leading /
// trailing dash, no double dash.
export const DERIVED_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Hard ceiling on slug length; 80 matches the per-table schemas
// (`tag.slug`, `category.slug`, `pageMeta.slug`).
export const SLUG_MAX = 80

// Slugger — github-slugger replacement with per-instance dedup.
// `makeSlug` is a byte-exact reimplementation of the retired `slugify`
// output for this project's fixed options, parity-verified over its
// charMap and a randomized Unicode corpus.

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
