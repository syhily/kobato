import { Hono } from 'hono'
import path from 'node:path'

import type { Env } from '@/server/http/context'

import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@/server/http/resources/serve-local-file'

/**
 * Dedicated public route for self-hosted web-font packages served from local
 * storage. Unlike the generic `/storage/*` route, this maps the URL pattern
 * `/fonts/embedded/<hash>/<filename>` to the storage key `fonts/<hash>/<filename>`
 * and serves the corresponding file from `$DATA_PATH/storage/`.
 *
 * Font packages are content-addressed (the `<hash>` is the sha256 of the
 * source TTF/OTF), so all responses are marked immutable with a one-year
 * cache lifetime.
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

/**
 * Extract the hash and filename from a `/fonts/embedded/<hash>/<filename>`
 * URL path. Returns `null` when the path does not match the expected pattern.
 *
 * The hash must be exactly 64 lowercase hex characters (sha256). Any path
 * containing a hidden segment or dotfile prefix is rejected.
 */
function parseEmbeddedFontPath(urlPath: string): { hash: string; filename: string } | null {
  // urlPath looks like: /fonts/embedded/abc123.../result.css
  // or:                /fonts/embedded/abc123.../chunk-001.woff2
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

  // Validate hash: must be 64 lowercase hex chars.
  if (hash.length !== 64 || !/^[0-9a-f]{64}$/.test(hash)) {
    return null
  }
  // Reject empty filenames, dotfiles, and hidden segments anywhere in the
  // remaining path (defence-in-depth alongside resolveLocalPath).
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

  // URL → storage-key inverse of the `local` branch of `resolveAssetUrl`
  // (src/server/infra/storage/public-url.ts), which the fonts render service
  // targets with `local: { route: '/fonts/embedded/', stripPrefix: 'fonts/' }`.
  // The route shape is owned here; keep the pair in sync.
  const storageKey = `fonts/${parsed.hash}/${parsed.filename}`

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
