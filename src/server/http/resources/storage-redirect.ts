import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'
import { isS3Primary } from '@/server/infra/storage/registry'
import { requireBlogSettingsSection } from '@/shared/config/getters'

/**
 * Redirect branch for the site-owned asset routes (`/storage/*`,
 * `/fonts/embedded/*`). Content stores origin-relative asset URLs so a
 * backend/bucket/CDN switch never breaks stored links; when S3 is the primary
 * backend the site 302s to the CURRENT public base instead of streaming.
 * Short cache lifetime: the target moves with the storage config.
 *
 * The CDN transform template (`assets.storage.urlTemplate`) is applied HERE,
 * at this boundary — not inline in the browser. Clients signal transform
 * intent with `w`/`h`/`q` query params on the site-owned URL (see
 * `@/shared/types/images`); a templated redirect substitutes them into the
 * template and consumes them, preserving unrelated params (`?v=`). No
 * template or no valid transform params → plain object redirect.
 */
export const STORAGE_REDIRECT_CACHE_CONTROL = 'public, max-age=300'

/** Positive-integer query param within `max` (malformed / out-of-range → null). */
function parseTransformParam(value: string | null, max: number): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return parsed >= 1 && parsed <= max ? parsed : null
}

// Clamp the transform keyspace: an unclamped `?w=&h=` pair would mint a
// distinct CDN transform URL per request (each one a cache miss on the CDN's
// transform cache and a line on the bill). Out-of-range values are ignored
// exactly like a malformed one — no substitution, the query string rides
// along untouched (the same behavior as an unset template).
const MAX_TRANSFORM_DIMENSION = 4096
const MAX_TRANSFORM_QUALITY = 100

/**
 * `<publicBase>/<key>` plus the query string, with `w`/`h`/`q` substituted into
 * the configured CDN template — the server-side twin of `getImageUrl`/
 * `getImageSrcset` in `src/shared/types/images.ts`; keep the two semantics in
 * sync. Template rules: `{src}` → the object URL, a template without `{src}`
 * appended to it; `w`/`h` are a pair. Transform params are consumed; the rest
 * (e.g. `?v=`) survives.
 */
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

/** The configured template from the request-pinned bundle, or `''` when unset / not hydrated. */
function readUrlTemplate(settings: BlogSettingsBundle | null): string {
  try {
    return requireBlogSettingsSection('assets', settings).storage.urlTemplate.trim()
  } catch {
    // Settings not hydrated yet — serve the plain object URL.
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

/**
 * `302 Found` to `<current public base>/<key>` when S3 is the primary
 * backend, preserving the request query string (e.g. the `?v=` cache buster);
 * `null` when the local driver serves and the caller should stream (transform
 * params are simply ignored there). `key` must be the DECODED storage key —
 * it is re-encoded per segment for the Location header. A missing public base
 * while S3 is active is a config error, not a crash.
 */
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
