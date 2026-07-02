import semver from 'semver'

interface SlugifyOptions {
  inklingVersion?: string
  type?: string
}

export default function slugify(
  inputString: unknown = '',
  { inklingVersion = '4.0', type = 'mobiledoc' }: SlugifyOptions = {},
): string {
  const version = semver.coerce(inklingVersion)

  if (typeof inputString !== 'string' || (inputString || '').trim() === '') {
    return ''
  }

  if (version && semver.satisfies(version, '<4.x')) {
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
