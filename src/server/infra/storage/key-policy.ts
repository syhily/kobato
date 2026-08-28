import path from 'node:path'

/**
 * Single owner of storage key policy: extension → Content-Type and
 * key-prefix → cache visibility. The serving routes (`/storage/*`,
 * `/fonts/embedded/*`), the S3 adapter's header defaults, and the
 * migration's source-without-headers fallback all read from here — before
 * this module each kept a private copy and the maps had already drifted.
 */

/** Cache-visibility class of a stored object: `public` assets are CDN-cacheable. */
export type ObjectVisibility = 'public' | 'private'

export const DEFAULT_PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const DEFAULT_PRIVATE_CACHE_CONTROL = 'private, max-age=31536000'

// Objects under these prefixes were always private-cache uploads (DB dumps,
// branding originals, audit-log archives); everything else is public.
const PRIVATE_KEY_PREFIXES = ['backup/', 'branding/', 'audit-log/']

/** Key → visibility: the prefix rule upload callers and the migration fallback share. */
export function visibilityForKey(key: string): ObjectVisibility {
  return PRIVATE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ? 'private' : 'public'
}

/** The visibility → Cache-Control mapping — applied by the S3 adapter at write time. */
export function cacheControlForVisibility(visibility: ObjectVisibility): string {
  return visibility === 'private' ? DEFAULT_PRIVATE_CACHE_CONTROL : DEFAULT_PUBLIC_CACHE_CONTROL
}

/** Default Cache-Control for a key whose source cannot report a stored header. */
export function defaultCacheControlForKey(key: string): string {
  return cacheControlForVisibility(visibilityForKey(key))
}

// Superset of every extension the site stores or serves: images, audio,
// fonts, feed/manifest documents, and backup artefacts.
const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.db': 'application/octet-stream',
  '.gz': 'application/gzip',
}

/** Extension → Content-Type, `application/octet-stream` for anything unlisted. */
export function contentTypeForKey(key: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}
