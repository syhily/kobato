/**
 * The autolink policy behind `InklingAutoLinkPlugin`: the matcher set plus
 * the boundary separators, headless so the semantics are a synchronous test
 * table instead of e2e-only. Aligned with the host's previous tiptap
 * `Link.configure({ autolink: true })` surface (tiptap 3.31, linkify
 * defaults):
 *
 * - Scheme URLs (`http(s)`/`ftp(s)://…`) link verbatim.
 * - `www.`-prefixed and bare domains with an alpha TLD (2+ letters) link with
 *   tiptap's `defaultProtocol` (`http://`) prepended. IPv4 literals never
 *   match (the TLD must be alphabetic).
 * - Emails link as `mailto:`.
 * - Trailing punctuation (`.,;:!?`, quotes) and unbalanced closing brackets
 *   are excluded from the match — `(https://x.com)` links without the parens,
 *   and a Wikipedia-style `…/Foo_(bar)` keeps its balanced `)`.
 *
 * The plugin machinery is upstream `registerAutoLink` (`@lexical/link`); the
 * React `AutoLinkPlugin` wrapper cannot take a `separatorRegex`, so the
 * plugin mounts the register call directly to widen the boundary set
 * (upstream's default `/[.,;\s]/` would reject a link hugged by `!?()[]`).
 */

import type { LinkMatcher } from '@lexical/link'

/** The boundary characters that validate the edges of an auto-link match. */
export const AUTOLINK_SEPARATOR = /[\s.,;:!?'"()[\]{}<>]/

const SCHEME_URL = String.raw`(?:https?|ftps?)://[^\s<>"']+`
const WWW_URL = String.raw`www\.[^\s<>"']+`
const EMAIL = String.raw`[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}`
// bare domain: alpha TLD of 2+ letters, so IPv4 literals and dotless hosts
// never match (tiptap's shouldAutoLink rejects both)
const BARE_DOMAIN = String.raw`(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:[/?#:][^\s<>"']*)?`

// Alternation order is the precedence at a shared start position: a scheme
// URL swallows any `www.`/email/domain it contains; an email wins over the
// domain inside it; `www.` wins over the bare-domain reading.
const AUTOLINK_PATTERN = new RegExp([SCHEME_URL, WWW_URL, EMAIL, BARE_DOMAIN].join('|'), 'i')

const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/

const CLOSING_BRACKET_OPENERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/** Strips characters that belong to the sentence, not the URL, off a raw match. */
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

/** Derives the href from the matched text: verbatim for scheme URLs, tiptap's `defaultProtocol` for the rest. */
export function autolinkUrl(text: string): string {
  if (/^(?:https?|ftps?):\/\//i.test(text)) {
    return text
  }
  if (/@/.test(text) && !/^www\./i.test(text)) {
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
