import slugify from 'slugify'

// Isomorphic slug constants shared by server and UI.
// The regex matches `slugify` / `deriveSlug` output one-for-one:
// lowercase ASCII alphanumerics + `-`, no leading / trailing dash,
// no double dash.
export const DERIVED_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Hard ceiling on slug length. 80 matches the existing per-table
// schemas (`tag.slug`, `category.slug`, `pageMeta.slug`) so callers
// can validate against this constant instead of repeating the
// magic number.
export const SLUG_MAX = 80

// Slugger — github-slugger replacement backed by `slugify`

const SLUGIFY_OPTIONS = {
  lower: true,
  trim: true,
  strict: false,
  remove: /[^\p{L}\p{N}\s-]+/gu,
} as const

function makeSlug(text: string): string {
  return slugify(text, SLUGIFY_OPTIONS)
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
