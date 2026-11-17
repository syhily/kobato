import type { Env } from '@kobato/server/http/context.ts'

import { EMBEDDED_FONT_ROUTE_PREFIX, parseAssetUrlPath } from '@kobato/assets/asset-url.ts'
import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@kobato/server/http/resources/serve-local-file.ts'
import { s3StorageRedirect } from '@kobato/server/http/resources/storage-redirect.ts'
import { contentTypeForKey } from '@kobato/server/infra/storage/key-policy.ts'
import { Hono } from 'hono'

/**
 * Public route for self-hosted web-font packages: `/fonts/embedded/<hash>/<filename>`
 * maps to storage key `fonts/<hash>/<filename>`; content-addressed (sha256),
 * so responses are immutable with a one-year lifetime.
 */
export const fontsEmbeddedRouter = new Hono<Env>()

fontsEmbeddedRouter.get('/fonts/embedded/*', async (c) => {
  // Percent-decode first, exactly like `/storage/*`: the path grammar below and
  // `s3StorageRedirect` both operate on DECODED keys (and the redirect
  // re-encodes them per segment for the Location header).
  let pathname: string
  try {
    pathname = decodeURIComponent(c.req.path)
  } catch {
    return c.body(null, 400)
  }
  // URL → storage-key inverse of `resolveAssetUrl`'s route override; both
  // directions share the path grammar in `@kobato/assets/asset-url`.
  const parsed = parseAssetUrlPath(pathname)
  if (parsed === null || parsed.route !== EMBEDDED_FONT_ROUTE_PREFIX) {
    return c.body(null, 400)
  }
  const storageKey = parsed.key

  // S3 primary: 302 to the raw storage key on the current public base.
  const redirect = s3StorageRedirect(
    storageKey,
    new URL(c.req.url).search,
    c.var.requestContext.localization.locale,
    c.var.requestContext.settings,
  )
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
