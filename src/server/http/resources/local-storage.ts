import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@/server/http/resources/serve-local-file'
import { s3StorageRedirect } from '@/server/http/resources/storage-redirect'
import { contentTypeForKey } from '@/server/infra/storage/key-policy'

export const localStorageRouter = new Hono<Env>()

// Positive allowlist of publicly served namespaces — everything else under
// STORAGE_DIR (notably `backup/backup-<ts>.db.tar.gz`, a full DB dump) stays
// private; new namespaces are NOT served by default.
const PUBLIC_STORAGE_PREFIXES = ['images/', 'musics/', 'branding/']

/**
 * Publicly-servable key: allowlisted prefix, no empty or hidden (dotfile)
 * segments anywhere in the path.
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

localStorageRouter.get('/storage/*', async (c) => {
  // `c.req.path` is already normalized; slice + percent-decode; the backend re-applies the traversal guard.
  let key: string
  try {
    key = decodeURIComponent(c.req.path.slice('/storage/'.length))
  } catch {
    return c.body(null, 400)
  }
  // Gate before resolving — private namespaces 404 (not 403) before touching the filesystem.
  if (!isPublicStorageKey(key)) {
    return c.body(null, 404)
  }

  // S3 primary: the site-owned URL 302s to the current backend (query string
  // preserved) instead of streaming — the local copy may not exist anymore.
  const redirect = s3StorageRedirect(key, new URL(c.req.url).search)
  if (redirect !== null) {
    return redirect
  }

  return serveStoredLocalFile({
    key,
    contentType: contentTypeForKey(key),
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    headers: {
      ifNoneMatch: c.req.header('if-none-match'),
      range: c.req.header('range'),
    },
    logName: { scope: 'storage.local.http', target: 'local object' },
  })
})
