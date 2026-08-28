import { Hono } from 'hono'

import type { Env } from '@/server/http/context'

import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@/server/http/resources/serve-local-file'
import { s3StorageRedirect } from '@/server/http/resources/storage-redirect'
import { contentTypeForKey } from '@/server/infra/storage/key-policy'
import { EMBEDDED_FONT_ROUTE_PREFIX, parseAssetUrlPath } from '@/shared/types/asset-url'

/**
 * Public route for self-hosted web-font packages: `/fonts/embedded/<hash>/<filename>`
 * maps to storage key `fonts/<hash>/<filename>`; content-addressed (sha256),
 * so responses are immutable with a one-year lifetime.
 */
export const fontsEmbeddedRouter = new Hono<Env>()

fontsEmbeddedRouter.get('/fonts/embedded/*', async (c) => {
  // URL → storage-key inverse of `resolveAssetUrl`'s route override; both
  // directions share the path grammar in `@/shared/types/asset-url`.
  const parsed = parseAssetUrlPath(c.req.path)
  if (parsed === null || parsed.route !== EMBEDDED_FONT_ROUTE_PREFIX) {
    return c.body(null, 400)
  }
  const storageKey = parsed.key

  // S3 primary: 302 to the raw storage key on the current public base.
  const redirect = s3StorageRedirect(storageKey, new URL(c.req.url).search)
  if (redirect !== null) {
    return redirect
  }

  return serveStoredLocalFile({
    key: storageKey,
    contentType: contentTypeForKey(storageKey),
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    headers: {
      ifNoneMatch: c.req.header('if-none-match'),
      range: c.req.header('range'),
    },
    logName: { scope: 'fonts.embedded.http', target: 'embedded font file' },
  })
})
