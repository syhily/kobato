import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { getPublicBaseUrl } from '@kobato/server/infra/storage/public-url'
import { isS3Primary } from '@kobato/server/infra/storage/registry'
import { requireBlogSettingsSection } from '@kobato/settings/getters'

export const STORAGE_REDIRECT_CACHE_CONTROL = 'public, max-age=300'

function parseTransformParam(value: string | null, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return parsed >= 1 && parsed <= max ? parsed : null
}

const MAX_TRANSFORM_DIMENSION = 4096
const MAX_TRANSFORM_QUALITY = 100

function buildRedirectLocation(objectUrl: string, search: string, settings: BlogSettingsBundle | null): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  let location = objectUrl

  const width = parseTransformParam(params.get('w'), MAX_TRANSFORM_DIMENSION)
  const height = parseTransformParam(params.get('h'), MAX_TRANSFORM_DIMENSION)
  const template = width !== null && height !== null ? readUrlTemplate(settings) : ''
  if (template !== '') {
    const quality = parseTransformParam(params.get('q'), MAX_TRANSFORM_QUALITY) ?? 100
    location = template
      .replaceAll('{width}', String(width))
      .replaceAll('{height}', String(height))
      .replaceAll('{quality}', String(quality))
    location = location.includes('{src}') ? location.replaceAll('{src}', objectUrl) : `${objectUrl}${location}`
    for (const name of ['w', 'h', 'q']) {
      params.delete(name)
    }
  }

  const preserved = params.toString()
  if (preserved !== '') {
    const sep = location.includes('?') ? '&' : '?'
    location = `${location}${sep}${preserved}`
  }
  return location
}

function readUrlTemplate(settings: BlogSettingsBundle | null): string {
  try {
    return requireBlogSettingsSection('assets', settings).storage.urlTemplate.trim()
  } catch {
    return ''
  }
}

function serviceUnavailable(locale: AppLocale): Response {
  const descriptor = descriptorFor('storage.error.unavailable')
  return new Response(createServerTranslator(locale).format(descriptor.messageKey, descriptor.params), {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Re-encode a DECODED storage key for the Location header, one path segment at
 * a time. The `/storage/*` route (and the fonts route) decode before the
 * allowlist check, so a key holding `?`, `#`, `%`, or a space would otherwise
 * be interpolated raw — truncating the CDN path (`a?b.png` → file `a` plus a
 * query) or emitting a fragment. Slashes stay separators.
 */
function encodeKeyForUrl(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

export function s3StorageRedirect(
  key: string,
  search: string,
  locale: AppLocale,
  settings: BlogSettingsBundle | null,
): Response | null {
  if (!isS3Primary()) {
    return null
  }
  const base = getPublicBaseUrl()
  if (base === null) {
    return serviceUnavailable(locale)
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildRedirectLocation(`${base}/${encodeKeyForUrl(key)}`, search, settings),
      'Cache-Control': STORAGE_REDIRECT_CACHE_CONTROL,
    },
  })
}
