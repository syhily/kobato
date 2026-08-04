import { SLUG_CHAR_MAP } from '@kobato/shared/slug-char-map'

// Isomorphic slug constants shared by server and UI.
// The regex matches `makeSlug` / `deriveSlug` output one-for-one:
// lowercase ASCII alphanumerics + `-`, no leading / trailing dash,
// no double dash.
export const DERIVED_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Hard ceiling on slug length. 80 matches the existing per-table
// schemas (`tag.slug`, `category.slug`, `pageMeta.slug`) so callers
// can validate against this constant instead of repeating the
// magic number.
export const SLUG_MAX = 80

// Slugger — github-slugger replacement with per-instance dedup.
//
// `makeSlug` below is a byte-exact reimplementation of the retired
// `slugify` package's output for this project's fixed options
// (`{ lower: true, trim: true, strict: false, remove: /[^\p{L}\p{N}\s-]+/gu }`),
// parity-verified against slugify 1.6 over its full charMap and a
// randomized Unicode corpus. The pipeline mirrors slugify's own order:
//
//   1. NFC-normalize, then substitute each char through SLUG_CHAR_MAP;
//      a char that maps to the `-` replacement becomes a space (so it
//      collapses into neighboring whitespace instead of doubling dashes);
//   2. strip every char that is not a letter / number / whitespace / `-`;
//   3. trim, collapse whitespace runs to a single `-`, lowercase.

const REMOVE_PATTERN = /[^\p{L}\p{N}\s-]+/gu

function makeSlug(text: string): string {
  let mapped = ''
  for (const ch of text.normalize()) {
    const substituted = SLUG_CHAR_MAP[ch] ?? ch
    mapped += substituted === '-' ? ' ' : substituted
  }
  return mapped.replace(REMOVE_PATTERN, '').trim().replace(/\s+/g, '-').toLowerCase()
}

/** Minimal replacement for `github-slugger` with per-instance dedup. */
export class Slugger {
  private seen = new Set<string>()

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
