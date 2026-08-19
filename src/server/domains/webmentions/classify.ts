import { normalizeForMatch } from '@/server/domains/webmentions/verify'
import { WEBMENTION_TYPES } from '@/shared/contracts/webmentions'

// mf2 response-type classification for received webmentions (async-inbox
// design, docs/plans/2026-08-02-webmention-async-inbox-design.md). Only
// markers carried ON the anchor count — a marker on a wrapper element
// classifies as `mention`; verification never depends on the type, so a
// miss costs presentation grouping, never acceptance.

export type WebmentionType = (typeof WEBMENTION_TYPES)[number]

const ANCHOR_TAG_RE = /<a\b[^>]*>/gi
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const CLASS_RE = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i

const MARKER_TYPES: ReadonlyArray<[marker: string, type: WebmentionType]> = [
  ['u-in-reply-to', 'reply'],
  ['u-repost-of', 'repost'],
  ['u-like-of', 'like'],
]

// Priority when several markers point at the target: the strongest wins.
const TYPE_PRIORITY: Record<WebmentionType, number> = {
  mention: 0,
  like: 1,
  repost: 2,
  reply: 3,
}

function anchorHref(tag: string): string | null {
  const match = HREF_RE.exec(tag)
  const href = match?.[1] ?? match?.[2] ?? match?.[3]
  return href === undefined || href === '' ? null : href
}

function anchorMarkerTypes(tag: string): WebmentionType[] {
  const classValue = (CLASS_RE.exec(tag))?.[1] ?? (CLASS_RE.exec(tag))?.[2]
  if (classValue === undefined) {
    return []
  }
  const classes = classValue.split(/\s+/)
  return MARKER_TYPES.filter(([marker]) => classes.includes(marker)).map(([, type]) => type)
}

/**
 * Strongest mf2 marker on an anchor resolving to the target canonical URL;
 * URL equality is exactly the link verification's (`normalizeForMatch`).
 */
export function classifyWebmentionType(html: string, sourceUrl: string, targetCanonicalUrl: string): WebmentionType {
  const wanted = normalizeForMatch(targetCanonicalUrl)
  if (wanted === null) {
    return 'mention'
  }
  let best: WebmentionType = 'mention'
  for (const match of html.matchAll(ANCHOR_TAG_RE)) {
    const tag = match[0]
    const markers = anchorMarkerTypes(tag)
    if (markers.length === 0) {
      continue
    }
    const href = anchorHref(tag)
    if (href === null) {
      continue
    }
    let resolved: URL
    try {
      resolved = new URL(href, sourceUrl)
    } catch {
      continue
    }
    if (normalizeForMatch(resolved.toString()) !== wanted) {
      continue
    }
    for (const type of markers) {
      if (TYPE_PRIORITY[type] > TYPE_PRIORITY[best]) {
        best = type
      }
    }
  }
  return best
}
