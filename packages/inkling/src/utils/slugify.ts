export interface SlugifyOptions {
  inklingVersion?: string
  /** The pre-4.0 format to reproduce — the only honored values (any other string silently took the mobiledoc branch). */
  type?: 'mobiledoc' | 'markdown'
}

/** The slug policy version callers get when they don't pass one. */
export const DEFAULT_INKLING_VERSION = '4.0'

// Only the `<4.x` vs `>=4.x` distinction matters (pre-4.0 slug formats).
// Versions that don't parse as `major.minor` are treated as latest, matching
// the old null-coercion fallthrough.
export function isLegacyVersion(inklingVersion: string): boolean {
  const major = Number.parseInt(inklingVersion, 10)
  return !Number.isNaN(major) && major < 4
}

export default function slugify(
  inputString: string | null = '',
  { inklingVersion = DEFAULT_INKLING_VERSION, type = 'mobiledoc' }: SlugifyOptions = {},
): string {
  if (typeof inputString !== 'string' || inputString.trim() === '') {
    return ''
  }

  if (isLegacyVersion(inklingVersion)) {
    if (type === 'markdown') {
      // backwards compatible slugs used in the pre-4.0 markdown format
      return inputString.replace(/[^\w]/g, '').toLowerCase()
    } else {
      // backwards compatible slugs used in the pre-4.0 mobiledoc format
      return inputString
        .replace(/[<>&"?]/g, '')
        .trim()
        .replace(/[^\w]/g, '-')
        .replace(/-{2,}/g, '-')
        .toLowerCase()
    }
  } else {
    // new slugs introduced in 4.0
    // allows all chars except symbols but will urlEncode everything
    // produces %-encoded chars in src but browsers show real chars in status bar and url bar
    return encodeURIComponent(
      inputString
        .trim()
        .toLowerCase()
        .replace(/[\][!"#$%&'()*+,./:;<=>?@\\^_{|}~]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-|-{2,}|-$/g, ''),
    )
  }
}

export { slugify }
