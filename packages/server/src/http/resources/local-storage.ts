import type { Env } from '@kobato/server/http/hono-env'

import { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } from '@kobato/server/http/resources/serve-local-file'
import { s3StorageRedirect } from '@kobato/server/http/resources/storage-redirect'
import { contentTypeForKey } from '@kobato/server/infra/storage/key-policy'
import { Hono } from 'hono'

export const localStorageRouter = new Hono<Env>()

const PUBLIC_STORAGE_PREFIXES = ['images/', 'musics/', 'branding/']

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
  let key: string
  try {
    key = decodeURIComponent(c.req.path.slice('/storage/'.length))
  } catch {
    return c.body(null, 400)
  }
  if (!isPublicStorageKey(key)) {
    return c.body(null, 404)
  }

  const redirect = s3StorageRedirect(
    key,
    new URL(c.req.url).search,
    c.var.requestContext.localization.locale,
    c.var.requestContext.settings,
  )
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
