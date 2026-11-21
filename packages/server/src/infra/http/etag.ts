import type { AppLocalization } from '@kobato/settings/app-localization'

import { APP_VERSION } from '@kobato/distribution/app'
import { CACHE_PROFILES } from '@kobato/server/infra/http/headers'
import { formatLocalDate } from '@kobato/utils/site-date'
import { createHash } from 'node:crypto'

export interface RepresentationFingerprint {
  version: string
  locale: AppLocalization['locale']
  timeZone: string
  timeFormat: string
  revision: string
}

export function representationFromLocalization(localization: AppLocalization): RepresentationFingerprint {
  return {
    version: APP_VERSION,
    locale: localization.locale,
    timeZone: localization.timeZone,
    timeFormat: localization.timeFormat ?? 'auto',
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
  id: string | number
  publishedRevisionId: string | number | null
  publishedAt: Date | undefined
  representation: RepresentationFingerprint
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

export function postEtag(input: DetailEtagInput): string {
  return weakEtag(['post', ...detailParts(input)])
}

export function pageEtag(input: DetailEtagInput): string {
  return weakEtag(['page', ...detailParts(input)])
}

export function listingRepresentation(localization: AppLocalization): RepresentationFingerprint {
  return {
    ...representationFromLocalization(localization),
    revision: localization.revisions.listing,
  }
}

const LISTING_VOLATILE_KEYS: ReadonlySet<string> = new Set(['listingNowIso'])

export interface ListingEtagInput {
  representation: RepresentationFingerprint
  payload: unknown
  calendarDay: string
}

export function listingEtag({ representation, payload, calendarDay }: ListingEtagInput): string {
  return weakEtag([
    'listing',
    ...representationParts(representation),
    calendarDay,
    stableStringify(payload, LISTING_VOLATILE_KEYS),
  ])
}

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

export function listingCalendarDay(payload: unknown, localization: AppLocalization): string {
  return formatLocalDate(listingInstant(payload), 'yyyy-MM-dd', localization)
}

export function contentEtag(content: string | Uint8Array): string {
  const hash = createHash('sha1')
  hash.update(content)
  return `"${hash.digest('hex').slice(0, 32)}"`
}

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
