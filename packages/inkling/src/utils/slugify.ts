export interface SlugifyOptions {
  inklingVersion?: string
  type?: 'mobiledoc' | 'markdown'
}

export const DEFAULT_INKLING_VERSION = '4.0'

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
      return inputString.replace(/[^\w]/g, '').toLowerCase()
    }

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
