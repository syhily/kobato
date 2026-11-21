import type { Env } from '@kobato/server/http/hono-env'

import { EMBEDDED_FONT_ROUTE_PREFIX, parseAssetUrlPath } from '@kobato/assets/asset-url'
import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@kobato/server/http/resources/serve-local-file'
import { s3StorageRedirect } from '@kobato/server/http/resources/storage-redirect'
import { contentTypeForKey } from '@kobato/server/infra/storage/key-policy'
import { Hono } from 'hono'

export const fontsEmbeddedRouter = new Hono<Env>()

fontsEmbeddedRouter.get('/fonts/embedded/*', async (c) => {
  let pathname: string
  try {
    pathname = decodeURIComponent(c.req.path)
  } catch {
    return c.body(null, 400)
  }
  const parsed = parseAssetUrlPath(pathname)
  if (parsed === null || parsed.route !== EMBEDDED_FONT_ROUTE_PREFIX) {
    return c.body(null, 400)
  }
  const storageKey = parsed.key

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
