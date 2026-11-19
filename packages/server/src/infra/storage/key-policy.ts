import path from 'node:path'

/**
 * Single owner of storage key policy: extension → Content-Type and key-prefix →
 * cache visibility. The serving routes (`/storage/*`, `/fonts/embedded/*`), the S3
 * adapter's header defaults, and the migration's header-less fallback read from here.
 */

export type ObjectVisibility = 'public' | 'private'

export const DEFAULT_PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const DEFAULT_PRIVATE_CACHE_CONTROL = 'private, max-age=31536000'

// Objects under these prefixes are private (DB dumps, branding originals,
// audit-log archives); everything else is public.
const PRIVATE_KEY_PREFIXES = ['backup/', 'branding/', 'audit-log/']

export function visibilityForKey(key: string): ObjectVisibility {
  return PRIVATE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ? 'private' : 'public'
}

export function cacheControlForVisibility(visibility: ObjectVisibility): string {
  return visibility === 'private' ? DEFAULT_PRIVATE_CACHE_CONTROL : DEFAULT_PUBLIC_CACHE_CONTROL
}

export function defaultCacheControlForKey(key: string): string {
  return cacheControlForVisibility(visibilityForKey(key))
}

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

export function contentTypeForKey(key: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}
