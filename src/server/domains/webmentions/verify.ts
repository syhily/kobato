import { DomainError } from '@/server/infra/http/errors'
import { tryParseUrl } from '@/shared/utils/safe-url'

// Link verification + best-effort metadata extraction. Regex-based and
// best-effort (the fetch layer size-caps the document); the only hard
// requirement is an `<a href>` resolving to the target.

const ANCHOR_HREF_RE = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i
const META_TAG_RE = /<meta\b[^>]*>/gi

const MAX_TITLE_LENGTH = 500
const MAX_SUMMARY_LENGTH = 1000
const MAX_AUTHOR_LENGTH = 200

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

function clean(value: string, max: number): string | null {
  const text = decodeEntities(stripTags(value)).replace(/\s+/g, ' ').trim()
  if (text === '') {
    return null
  }
  return text.slice(0, max)
}

/** Normalise for link-equality: http(s) only, fragment and default ports
 *  dropped, trailing slashes stripped; query strings compare as-is. */
export function normalizeForMatch(raw: string): string | null {
  const url = tryParseUrl(raw)
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null
  }
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = ''
  }
  url.hash = ''
  let path = url.pathname
  while (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  url.pathname = path
  return url.toString()
}

/** `normalizeForMatch` for http(s)-constrained inputs: null is unreachable,
 *  so it throws. The single source of the normalized source key. */
export function requireSourceKey(raw: string): string {
  const key = normalizeForMatch(raw)
  if (key === null) {
    throw new DomainError('BAD_REQUEST', 'source must be a valid http(s) URL')
  }
  return key
}

export function extractLinks(html: string): string[] {
  const links: string[] = []
  for (const match of html.matchAll(ANCHOR_HREF_RE)) {
    const href = match[1] ?? match[2] ?? match[3]
    if (href !== undefined && href !== '') {
      links.push(decodeEntities(href))
    }
  }
  return links
}

/** True when an `<a href>` (relative links resolved against the source URL)
 *  resolves to the target canonical URL — only anchors count. */
export function sourceLinksToTarget(html: string, sourceUrl: string, targetCanonicalUrl: string): boolean {
  const wanted = normalizeForMatch(targetCanonicalUrl)
  if (wanted === null) {
    return false
  }
  for (const link of extractLinks(html)) {
    let resolved: URL
    try {
      resolved = new URL(link, sourceUrl)
    } catch {
      continue
    }
    if (normalizeForMatch(resolved.toString()) === wanted) {
      return true
    }
  }
  return false
}

function findMetaContent(html: string, key: 'name' | 'property', value: string): string | null {
  for (const match of html.matchAll(META_TAG_RE)) {
    const tag = match[0]
    const keyRe = new RegExp(`\\b${key}\\s*=\\s*["']${value}["']`, 'i')
    if (!keyRe.test(tag)) {
      continue
    }
    const content = /\bcontent\s*=\s*"([^"]*)"/i.exec(tag) ?? /\bcontent\s*=\s*'([^']*)'/i.exec(tag)
    if (content?.[1] !== undefined) {
      return content[1]
    }
  }
  return null
}

export interface SourceMetadata {
  authorName: string | null
  title: string | null
  summary: string | null
}

/** Best-effort author/title/summary extraction for the moderation list. */
export function extractSourceMetadata(html: string): SourceMetadata {
  const titleMatch = TITLE_RE.exec(html)
  const title = titleMatch?.[1] !== undefined ? clean(titleMatch[1], MAX_TITLE_LENGTH) : null
  return {
    authorName: nullableMeta(html, 'name', 'author', MAX_AUTHOR_LENGTH),
    title: title ?? nullableMeta(html, 'property', 'og:title', MAX_TITLE_LENGTH),
    summary:
      nullableMeta(html, 'name', 'description', MAX_SUMMARY_LENGTH) ??
      nullableMeta(html, 'property', 'og:description', MAX_SUMMARY_LENGTH),
  }
}

function nullableMeta(html: string, key: 'name' | 'property', value: string, max: number): string | null {
  const raw = findMetaContent(html, key, value)
  return raw === null ? null : clean(raw, max)
}
