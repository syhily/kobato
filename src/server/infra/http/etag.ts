import { createHash } from 'node:crypto'

import type { AppLocale } from '@/shared/i18n/locales'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { APP_VERSION } from '@/shared/config/version'
import { resolveAppLocalization } from '@/shared/i18n/app-localization'

/**
 * Everything that changes the HTML REPRESENTATION of a detail page without
 * changing the content row. A response ETag must change when any of these do,
 * or a stale 304 would serve the previous locale/format after a settings
 * change. `version` is the app release (translations/renderers ship with it).
 */
export interface RepresentationFingerprint {
  version: string
  locale: AppLocale
  timeZone: string
  /** `auto` when the site follows the locale's Intl default. */
  timeFormat: string
}

/** The representation inputs derived from the current settings snapshot. */
export function currentRepresentation(): RepresentationFingerprint {
  const localization = resolveAppLocalization()
  return {
    version: APP_VERSION,
    locale: localization.locale,
    timeZone: localization.timeZone,
    timeFormat: getBlogSettingsBundleSync()?.siteIdentity?.timeFormat ?? 'auto',
  }
}

function representationParts(representation: RepresentationFingerprint): string[] {
  return [representation.version, representation.locale, representation.timeZone, representation.timeFormat]
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
        .join(''),
    )
    .digest('hex')
    .slice(0, 16)
  return `W/"${hash}"`
}

// Shared by the slim probe and the full-path re-check so both yield the same ETag.
// The representation fingerprint is part of the tag: locale / time zone /
// display format / app version changes must invalidate cached HTML.
export function postEtag(
  id: string | number,
  publishedAt: Date | undefined,
  representation: RepresentationFingerprint = currentRepresentation(),
): string {
  return weakEtag(['post', String(id), publishedAt, ...representationParts(representation)])
}

// Shared by the slim probe and the full-path re-check (id + publishedRevisionId + publishedAt).
export function pageEtag(
  id: string | number,
  publishedRevisionId: string | number | null,
  publishedAt: Date | undefined,
  representation: RepresentationFingerprint = currentRepresentation(),
): string {
  return weakEtag(['page', String(id), publishedRevisionId, publishedAt, ...representationParts(representation)])
}

// The oRPC wire has no header channel, so the If-None-Match string arrives as an input field.
export function etagHeaderMatches(header: string | null | undefined, etag: string): boolean {
  if (header === null || header === undefined) {
    return false
  }
  return header
    .split(',')
    .map((s) => s.trim())
    .includes(etag)
}

export function notModifiedResponse(etag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag, Vary: 'Cookie' } })
}
