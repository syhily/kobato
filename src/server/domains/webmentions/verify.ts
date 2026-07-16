import { tryParseUrl } from '@/shared/utils/safe-url'

// Link verification + best-effort metadata extraction for webmention
// source documents. Deliberately regex-based: the document is already
// size-capped (1 MB) by the fetch layer, extraction is best-effort by
// design (microformats2 parsing is Phase 2), and the only hard
// requirement is finding an <a href> that resolves to the target.

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

/**
 * Normalise a URL for the link-equality check: keep only http(s) URLs,
 * drop the fragment, drop default ports, and strip trailing slashes
 * from the path (except the root). Scheme and host are already
 * lowercased by `URL`. Query strings are compared as-is — a mention of
 * `?utm_source=…` is NOT the canonical target (strict rule, documented
 * in plan 026's reviewer notes).
 */
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

/**
 * True when the source HTML contains an `<a href>` that resolves
 * (relative links resolved against the source URL) to the target's
 * canonical URL. Only `<a>` counts in the slice — like/repost/reply
 * markup that mentions the target via `<img src>`, `<u-like-of>` etc.
 * is Phase 2.
 */
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
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)
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
  const titleMatch = html.match(TITLE_RE)
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
