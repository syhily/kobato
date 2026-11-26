import type { StorageObjectOutput } from '@kobato/api/contracts/public/storage'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { RESOURCE_STREAM_HEADER } from '@kobato/api/client/resource-stream'
import { storageContract } from '@kobato/api/rpc/public/storage'
import { lookupStoredLocalObject } from '@kobato/server/domains/storage/local-object'
import { s3StorageRedirect } from '@kobato/server/domains/storage/redirect'
import { contentNotFound } from '@kobato/server/http/content-not-found'
import { mediaFileAnswer } from '@kobato/server/http/media-resource'
import { implementPublic, localizedOrpcError, localizedOrpcErrorDescriptor } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DEFAULT_PUBLIC_CACHE_CONTROL, contentTypeForKey } from '@kobato/server/infra/storage/key-policy'

const impl = implementPublic(storageContract)

const STORAGE_ROUTE_PREFIX = '/storage/'

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

function badPath(context: HandlerContext): never {
  throw localizedOrpcError(context, 'BAD_REQUEST', 'error.api.badRequest')
}

const object = impl.object.handler(async ({ input, context }): Promise<StorageObjectOutput> => {
  if (!input.path.startsWith(STORAGE_ROUTE_PREFIX)) {
    contentNotFound()
  }
  let key: string
  try {
    key = decodeURIComponent(input.path.slice(STORAGE_ROUTE_PREFIX.length))
  } catch {
    badPath(context)
  }
  if (!isPublicStorageKey(key)) {
    contentNotFound()
  }

  const redirect = s3StorageRedirect(key, input.search ?? '', context.settings)
  if (redirect === 'unavailable') {
    throw localizedOrpcErrorDescriptor(context, 'SERVICE_UNAVAILABLE', descriptorFor('storage.error.unavailable'))
  }
  if (redirect !== null) {
    return redirect
  }

  const lookup = await lookupStoredLocalObject(key, 'storage.local.http', 'local object')
  if (lookup === 'invalid-path') {
    badPath(context)
  }
  if (lookup === 'missing') {
    contentNotFound()
  }

  const answer = mediaFileAnswer(
    lookup,
    { ifNoneMatch: input.ifNoneMatch, range: input.range },
    { contentType: contentTypeForKey(key), cacheControl: DEFAULT_PUBLIC_CACHE_CONTROL },
  )
  if (answer.kind === 'stream') {
    context.responseHeaders.set(RESOURCE_STREAM_HEADER, String(answer.status))
    for (const [name, value] of Object.entries(answer.headers)) {
      context.responseHeaders.set(name, value)
    }
    return answer.output
  }
  return answer.answer
})

export const storageRouter = impl.router({
  object,
})
