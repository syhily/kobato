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

/** Positive-integer query param (malformed → null). */
function parseTransformParam(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value) || value === '0') {
    return null
  }
  return Number(value)
}

/**
 * Build the redirect target: `<publicBase>/<key>` plus the request's query
 * string (`?v=` cache buster passes through). When a CDN transform is
 * requested (`w`/`h`) AND `assets.storage.urlTemplate` is configured, the
 * template substitutes over the object URL — the server-side twin of the
 * client-side `getImageUrl`/`getImageSrcset` transform in
 * `src/shared/types/images.ts` (which emits the `w`/`h`/`q` params this
 * consumes); keep the two semantics in sync. Mirrors the legacy client-side
 * template semantics: `{src}` → the object URL, a template without `{src}`
 * appended to it; `w`/`h` must both be valid positive integers (the client
 * emits them as a pair), missing/invalid `q` falls back to the historical
 * default of 100. The transform params are consumed; everything else
 * (e.g. `?v=`) survives.
 */
function buildRedirectLocation(objectUrl: string, search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  let location = objectUrl

  const width = parseTransformParam(params.get('w'))
  const height = parseTransformParam(params.get('h'))
  const template = width !== null && height !== null ? readUrlTemplate() : ''
  if (template !== '') {
    const quality = parseTransformParam(params.get('q')) ?? 100
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

/** The configured template, or `''` when unset / settings not yet hydrated. */
function readUrlTemplate(): string {
  try {
    return requireBlogSettingsSection('assets').storage.urlTemplate.trim()
  } catch {
    // Settings snapshot not hydrated yet — serve the plain object URL.
    return ''
  }
}

function serviceUnavailable(): Response {
  return new Response('存储服务暂不可用，请稍后再试。', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * `302 Found` to `<current public base>/<key>` when S3 is the primary
 * backend, preserving the request query string (e.g. the `?v=` cache buster);
 * `null` when the local driver serves and the caller should stream (transform
 * params are simply ignored there). A missing public base while S3 is active
 * is a config error, not a crash.
 */
export function s3StorageRedirect(key: string, search: string): Response | null {
  if (!isS3Primary()) {
    return null
  }
  const base = getPublicBaseUrl()
  if (base === null) {
    return serviceUnavailable()
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildRedirectLocation(`${base}/${key}`, search),
      'Cache-Control': STORAGE_REDIRECT_CACHE_CONTROL,
    },
  })
}
