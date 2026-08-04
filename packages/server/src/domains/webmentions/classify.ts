import { normalizeForMatch } from '@kobato/server/domains/webmentions/verify'

// Response-type classification for received webmentions (async-inbox
// design, docs/plans/2026-08-02-webmention-async-inbox-design.md):
// IndieWeb sources declare the response kind with microformats2
// class markers on the anchor that links to our target —
//   <a class="u-in-reply-to" href="…"> → reply
//   <a class="u-repost-of"   href="…"> → repost
//   <a class="u-like-of"     href="…"> → like
// and a source with no recognized marker is a plain `mention`.
//
// Deliberately minimal (regex-based, same discipline as verify.ts): only
// markers carried ON the anchor itself are recognized. A marker on a
// wrapper element (`<div class="u-like-of"><a href>…`) classifies as
// `mention` — verification never depends on the classification, so a
// miss costs presentation grouping, never acceptance.

export type WebmentionType = 'mention' | 'reply' | 'like' | 'repost'

const ANCHOR_TAG_RE = /<a\b[^>]*>/gi
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const CLASS_RE = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i

const MARKER_TYPES: ReadonlyArray<[marker: string, type: WebmentionType]> = [
  ['u-in-reply-to', 'reply'],
  ['u-repost-of', 'repost'],
  ['u-like-of', 'like'],
]

// Priority when one document carries several markers pointing at the
// target (a reply that is also a repost is a reply): the strongest
// interaction wins.
const TYPE_PRIORITY: Record<WebmentionType, number> = {
  mention: 0,
  like: 1,
  repost: 2,
  reply: 3,
}

function anchorHref(tag: string): string | null {
  const match = tag.match(HREF_RE)
  const href = match?.[1] ?? match?.[2] ?? match?.[3]
  return href === undefined || href === '' ? null : href
}

function anchorMarkerTypes(tag: string): WebmentionType[] {
  const classValue = tag.match(CLASS_RE)?.[1] ?? tag.match(CLASS_RE)?.[2]
  if (classValue === undefined) {
    return []
  }
  const classes = classValue.split(/\s+/)
  return MARKER_TYPES.filter(([marker]) => classes.includes(marker)).map(([, type]) => type)
}

/**
 * Classify a verified webmention source: the strongest mf2 marker whose
 * anchor resolves to the target's canonical URL, `mention` when none
 * does. URL comparison reuses `normalizeForMatch`, so the equality
 * classes are exactly the link verification's.
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
