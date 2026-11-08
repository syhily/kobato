import { createHash } from 'node:crypto'

import type { AppLocalization } from '@/shared/i18n/app-localization'

import { CACHE_PROFILES } from '@/server/infra/http/headers'
import { APP_VERSION } from '@/shared/config/version'
import { formatLocalDate } from '@/shared/utils/formatter'

/**
 * Everything that changes the HTML REPRESENTATION of a detail page without
 * changing the content row. `version` is the app release (translations and
 * renderers ship with it); `revision` is the DETAIL scope's representation
 * generation (`localization.revisions.detail`) — never the boot token.
 * `timeFormat` is normalised — `auto` when the site follows the locale default.
 */
export interface RepresentationFingerprint {
  version: string
  locale: AppLocalization['locale']
  timeZone: string
  timeFormat: string
  revision: string
}

/**
 * Derive the representation fingerprint from the REQUEST's pinned localization
 * (locale + site zone + display format + settings revision). Every surface that
 * builds an ETag takes it from here — never from the global snapshot — so the
 * tag and the body it protects always describe one representation.
 */
export function representationFromLocalization(localization: AppLocalization): RepresentationFingerprint {
  return {
    version: APP_VERSION,
    locale: localization.locale,
    timeZone: localization.timeZone,
    timeFormat: localization.timeFormat ?? 'auto',
    // The DETAIL/page-shell generation: only sections the page renders move it.
    revision: localization.revisions.detail,
  }
}

function representationParts(representation: RepresentationFingerprint): (string | number)[] {
  return [
    representation.version,
    representation.locale,
    representation.timeZone,
    representation.timeFormat,
    representation.revision,
  ]
}

export function weakEtag(parts: ReadonlyArray<string | number | Date | null | undefined>): string {
  const hash = createHash('sha1')
    .update(
      parts
        .map((p) => {
          if (p === null || p === undefined) {
            return ''
          }
          if (p instanceof Date) {
            return p.toISOString()
          }
          return String(p)
        })
        .join('\u0000'),
    )
    .digest('hex')
    .slice(0, 16)
  return `W/"${hash}"`
}

// Canonical JSON: keys sorted, `undefined` members dropped, Dates as ISO
// strings. The payload is assembled from DB reads whose object key order is an
// implementation detail, so the fingerprint must not depend on it. `skipKeys`
// drops contract fields that are per-request rendering aids (the listing
// `listingNowIso` instant) from the representation fingerprint.
function stableStringify(value: unknown, skipKeys?: ReadonlySet<string>): string {
  if (value === null || value === undefined) {
    return 'null'
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, skipKeys)).join(',')}]`
  }
  if (typeof value === 'object') {
    const members = Object.entries(value)
      .filter(([key, member]) => member !== undefined && !skipKeys?.has(key))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${stableStringify(member, skipKeys)}`)
    return `{${members.join(',')}}`
  }
  return JSON.stringify(value)
}

export interface DetailEtagInput {
  /** The entity row id (`post.id` / `page.id`). */
  id: string | number
  /** The published revision — republishing without a new `published_at` still changes the tag. */
  publishedRevisionId: string | number | null
  /** Catalog `published_at` (the "last modified" instant the shell renders). */
  publishedAt: Date | undefined
  representation: RepresentationFingerprint
  /**
   * The EXACT payload the response carries (post shell, body html, tags,
   * sidebar, critical). Hashing it is what makes a 304 safe: the tag only
   * matches when every byte of the representation is identical.
   */
  payload: unknown
}

function detailParts(input: DetailEtagInput): ReadonlyArray<string | number | Date | null | undefined> {
  return [
    String(input.id),
    input.publishedRevisionId ?? '',
    input.publishedAt,
    ...representationParts(input.representation),
    stableStringify(input.payload),
  ]
}

/**
 * Post-detail ETag. Computed AFTER the full payload is assembled — the former
 * slim probe (id + published_at) could answer 304 while the sidebar, tags or
 * likes had changed.
 */
export function postEtag(input: DetailEtagInput): string {
  return weakEtag(['post', ...detailParts(input)])
}

/** Page-detail ETag — same full-payload contract as `postEtag`. */
export function pageEtag(input: DetailEtagInput): string {
  return weakEtag(['page', ...detailParts(input)])
}

/**
 * Listing representation fingerprint: locale + site zone + display format +
 * the LISTING generation + APP_VERSION. The listing generation is hashed from
 * exactly the settings sections the listing shell renders (see
 * `shared/config/representation-scopes`), so an unrelated settings save never
 * invalidates a listing ETag.
 */
export function listingRepresentation(localization: AppLocalization): RepresentationFingerprint {
  return {
    ...representationFromLocalization(localization),
    revision: localization.revisions.listing,
  }
}

/**
 * Contract fields excluded from the listing fingerprint. `listingNowIso` is the
 * per-request clock used to keep SSR/hydration date labels in step; the
 * calendar day already captures everything it can change.
 */
const LISTING_VOLATILE_KEYS: ReadonlySet<string> = new Set(['listingNowIso'])

export interface ListingEtagInput {
  representation: RepresentationFingerprint
  /**
   * The EXACT listing payload the response carries (pagination slice with the
   * metadata counters, SEO descriptors, sidebar/feature extra, categories or
   * archives rows). A 304 is only safe when all of it is identical.
   */
  payload: unknown
  /**
   * Site calendar day (`yyyy-MM-dd`) of the request. The listing's relative
   * date labels are bucketed by this day, and using it instead of the raw
   * `listingNowIso` keeps the tag stable across reloads within one day while
   * still rotating at midnight.
   */
  calendarDay: string
}

/** Listing-document ETag (home, page N, search, tag/category, archives, categories). */
export function listingEtag({ representation, payload, calendarDay }: ListingEtagInput): string {
  return weakEtag([
    'listing',
    ...representationParts(representation),
    calendarDay,
    stableStringify(payload, LISTING_VOLATILE_KEYS),
  ])
}

/**
 * The instant a listing payload rendered its relative dates from. Reading the
 * payload's own `listingNowIso` keeps the calendar-day bucket and the body in
 * step even when the request crosses the site-time-zone midnight between
 * payload assembly and ETag computation.
 */
function listingInstant(payload: unknown): Date {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    const entries: [string, unknown][] = Object.entries(payload)
    const instant = entries.find(([key]) => key === 'listingNowIso')?.[1]
    if (typeof instant === 'string') {
      const parsed = new Date(instant)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }
  }
  return new Date()
}

/**
 * The site calendar day the listing is bucketed by — derived from the payload's
 * OWN `listingNowIso` (the instant its SSR labels were rendered from), not from
 * a second clock read. Payloads without an instant (categories) fall back to
 * now. Explicit tokens override the site's display format.
 */
export function listingCalendarDay(payload: unknown, localization: AppLocalization): string {
  return formatLocalDate(listingInstant(payload), 'yyyy-MM-dd', localization)
}

/**
 * Strong ETag over the exact response bytes. Used by representations whose
 * body is generated (feed XML, calendar PNG, manifest JSON): hashing the bytes
 * that are actually served keeps the tag stable across a cache hit even when
 * the renderer embeds a timestamp, and changes whenever the output does.
 */
export function contentEtag(content: string | Uint8Array): string {
  const hash = createHash('sha1')
  hash.update(content)
  return `"${hash.digest('hex').slice(0, 32)}"`
}

/**
 * `If-None-Match` comparison. The header is a LIST (`*` allowed), so a
 * single-value equality check would miss stored tags; the comparison is WEAK
 * (`W/"x"` matches `"x"`), which is what RFC 9110 prescribes for this header.
 * The oRPC wire has no header channel, so the same string may arrive as an
 * input field on the HTML detail paths.
 */
export function etagHeaderMatches(header: string | null | undefined, etag: string): boolean {
  if (header === null || header === undefined) {
    return false
  }
  const target = weakComparable(etag)
  return header.split(',').some((raw) => {
    const candidate = raw.trim()
    return candidate === '*' || (candidate !== '' && weakComparable(candidate) === target)
  })
}

function weakComparable(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag
}

/**
 * A loader-thrown 304 goes through React Router's document-header reducer
 * (never `entry.server.tsx`), so it must carry the full current representation
 * metadata itself: ETag, Content-Language and the detail/listing Cache-Control
 * profile. The localization is the REQUEST's projection — the same one that
 * produced the ETag — so a document never mixes one locale's tag with another's
 * language. The root route's `headers` export passes these through
 * `errorHeaders`.
 */
export function notModifiedResponse(
  etag: string,
  localization: AppLocalization,
  profile: 'detail' | 'listing' = 'detail',
): Response {
  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      'Content-Language': localization.locale,
      'Cache-Control': CACHE_PROFILES[profile],
      Vary: 'Cookie',
    },
  })
}
