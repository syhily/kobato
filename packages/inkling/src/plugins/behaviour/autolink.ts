import type { LinkMatcher } from '@lexical/link'

export const AUTOLINK_SEPARATOR = /[\s.,;:!?'"()[\]{}<>]/

const SCHEME_URL = String.raw`(?:https?|ftps?)://[^\s<>"']+`
const WWW_URL = String.raw`www\.[^\s<>"']+`
const EMAIL = String.raw`[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}`
const BARE_DOMAIN = String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#:][^\s<>"']*)?`

const AUTOLINK_PATTERN = new RegExp([SCHEME_URL, WWW_URL, EMAIL, BARE_DOMAIN].join('|'), 'i')

const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/

const CLOSING_BRACKET_OPENERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

export function stripUrlTrailingPunctuation(text: string): string {
  let result = text
  for (;;) {
    const withoutPunctuation = result.replace(TRAILING_PUNCTUATION, '')
    if (withoutPunctuation.length !== result.length) {
      result = withoutPunctuation
      continue
    }
    const last = result[result.length - 1]
    const opener = last === undefined ? undefined : CLOSING_BRACKET_OPENERS[last]
    if (opener === undefined) {
      return result
    }
    const opens = result.split(opener).length - 1
    const closes = result.split(last).length - 1
    if (closes <= opens) {
      return result
    }
    result = result.slice(0, -1)
  }
}

export function autolinkUrl(text: string): string {
  if (/^(?:https?|ftps?):\/\//i.test(text)) {
    return text
  }
  if (text.includes('@') && !/^www\./i.test(text)) {
    return `mailto:${text}`
  }
  return `http://${text}`
}

export const INKLING_AUTOLINK_MATCHERS: LinkMatcher[] = [
  (text) => {
    const match = AUTOLINK_PATTERN.exec(text)
    if (match === null) {
      return null
    }
    const matched = stripUrlTrailingPunctuation(match[0])
    if (matched === '') {
      return null
    }
    return {
      index: match.index,
      length: matched.length,
      text: matched,
      url: autolinkUrl(matched),
    }
  },
]
