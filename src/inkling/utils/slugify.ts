export interface SlugifyOptions {
  inklingVersion?: string
  /** The pre-4.0 format to reproduce; any other value uses the mobiledoc branch. */
  type?: 'mobiledoc' | 'markdown'
}

/** The slug policy version callers get when they don't pass one. */
export const DEFAULT_INKLING_VERSION = '4.0'

// Only the `<4` vs `>=4` distinction matters (pre-4.0 slug formats); versions that do not
// parse as a number are treated as latest.
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
      // slugs used by the pre-4.0 markdown format
      return inputString.replace(/[^\w]/g, '').toLowerCase()
    }
    // backwards compatible slugs used in the pre-4.0 mobiledoc format
    return inputString
      .replace(/[<>&"?]/g, '')
      .trim()
      .replace(/[^\w]/g, '-')
      .replace(/-{2,}/g, '-')
      .toLowerCase()
  }
  // 4.0 slugs: encodeURIComponent keeps non-ASCII chars in the source while browsers
  // show them decoded in the URL bar.
  return encodeURIComponent(
    inputString
      .trim()
      .toLowerCase()
      .replace(/[\][!"#$%&'()*+,./:;<=>?@\\^_{|}~]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-|-{2,}|-$/g, ''),
  )
}

export { slugify }
