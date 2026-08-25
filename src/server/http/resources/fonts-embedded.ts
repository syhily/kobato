import { Hono } from 'hono'
import path from 'node:path'

import type { Env } from '@/server/http/context'

import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@/server/http/resources/serve-local-file'
import { s3StorageRedirect } from '@/server/http/resources/storage-redirect'

/**
 * Public route for self-hosted web-font packages: `/fonts/embedded/<hash>/<filename>`
 * maps to storage key `fonts/<hash>/<filename>`; content-addressed (sha256),
 * so responses are immutable with a one-year lifetime.
 */
export const fontsEmbeddedRouter = new Hono<Env>()

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

function contentTypeFor(key: string): string {
  return CONTENT_TYPE_BY_EXT[path.extname(key).toLowerCase()] ?? 'application/octet-stream'
}

/** Extract hash + filename from `/fonts/embedded/<hash>/<filename>`; null when the
 *  pattern mismatches. Hash must be 64 lowercase hex; no hidden segments. */
function parseEmbeddedFontPath(urlPath: string): { hash: string; filename: string } | null {
  const prefix = '/fonts/embedded/'
  if (!urlPath.startsWith(prefix)) {
    return null
  }
  const rest = urlPath.slice(prefix.length)
  if (rest === '' || rest.startsWith('/')) {
    return null
  }
  const slashIdx = rest.indexOf('/')
  if (slashIdx === -1) {
    return null
  }
  const hash = rest.slice(0, slashIdx)
  const filename = rest.slice(slashIdx + 1)

  if (hash.length !== 64 || !/^[0-9a-f]{64}$/.test(hash)) {
    return null
  }
  // Reject empty filenames, dotfiles, and hidden segments (defence-in-depth beside resolveLocalPath).
  if (filename === '') {
    return null
  }
  for (const segment of filename.split('/')) {
    if (segment === '' || segment.startsWith('.')) {
      return null
    }
  }
  return { hash, filename }
}

fontsEmbeddedRouter.get('/fonts/embedded/*', async (c) => {
  const parsed = parseEmbeddedFontPath(c.req.path)
  if (parsed === null) {
    return c.body(null, 400)
  }

  // URL → storage-key inverse of `resolveAssetUrl`'s route override — the
  // route shape is owned here; keep the pair in sync.
  const storageKey = `fonts/${parsed.hash}/${parsed.filename}`

  // S3 primary: 302 to the raw storage key on the current public base.
  const redirect = s3StorageRedirect(storageKey, new URL(c.req.url).search)
  if (redirect !== null) {
    return redirect
  }

  return serveStoredLocalFile({
    key: storageKey,
    contentType: contentTypeFor(storageKey),
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    headers: {
      ifNoneMatch: c.req.header('if-none-match'),
      range: c.req.header('range'),
    },
    logName: { scope: 'fonts.embedded.http', target: 'embedded font file' },
  })
})
