import { Hono } from 'hono'
import path from 'node:path'

import type { Env } from '@/server/http/context'

import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@/server/http/resources/serve-local-file'

export const localStorageRouter = new Hono<Env>()

// Only these namespaces are reachable through the unauthenticated public
// route — the media the site actually embeds. Everything else written under
// STORAGE_DIR (most critically `backup/backup-<ts>.db.gz`, a full database
// dump of password hashes / sessions / PII) MUST stay private.
//
// This is a positive allowlist, not a denylist, on purpose: a namespace
// added later defaults to *not* being publicly served, so a future private
// prefix can't leak just because nobody remembered to denylist it. The
// traversal guard in `resolveLocalPath` is not enough on its own — it only
// prevents escaping STORAGE_DIR, it does not restrict *which* subdirectory
// inside it is readable.
const PUBLIC_STORAGE_PREFIXES = ['images/', 'musics/', 'branding/']

/**
 * Whether a decoded key names a publicly-servable object. Rejects empty
 * keys, dotfiles, and any path containing a hidden segment (`.env`,
 * `backup/.htaccess`, …) so even an allowlisted namespace can't expose a
 * sensitive hidden file an operator may have dropped alongside uploads.
 */
function isPublicStorageKey(key: string): boolean {
  if (key === '') {
    return false
  }
  for (const segment of key.split('/')) {
    if (segment === '' || segment.startsWith('.')) {
      return false
    }
  }
  return PUBLIC_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
}

function contentTypeFor(key: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}

localStorageRouter.get('/storage/*', async (c) => {
  // `c.req.path` is already path-normalised by the router; slice the prefix
  // and percent-decode so non-ASCII filenames resolve. The local backend's
  // `resolveLocalPath` re-applies the `isPathInside` traversal guard.
  let key: string
  try {
    key = decodeURIComponent(c.req.path.slice('/storage/'.length))
  } catch {
    return c.body(null, 400)
  }
  // Gate before resolving: backups and any non-public namespace must 404
  // here, never reaching the filesystem. A 404 (not 403) avoids confirming
  // to an attacker that a private object exists.
  if (!isPublicStorageKey(key)) {
    return c.body(null, 404)
  }

  return serveStoredLocalFile({
    key,
    contentType: contentTypeFor(key),
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    headers: {
      ifNoneMatch: c.req.header('if-none-match'),
      range: c.req.header('range'),
    },
    logName: { scope: 'storage.local.http', target: 'local object' },
  })
})
