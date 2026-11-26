import type { EmbeddedFontOutput } from '@kobato/api/contracts/public/fonts'
import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { RESOURCE_STREAM_HEADER } from '@kobato/api/client/resource-stream'
import { fontsContract } from '@kobato/api/rpc/public/fonts'
import { EMBEDDED_FONT_ROUTE_PREFIX, parseAssetUrlPath } from '@kobato/assets/asset-url'
import { lookupStoredLocalObject } from '@kobato/server/domains/storage/local-object'
import { s3StorageRedirect } from '@kobato/server/domains/storage/redirect'
import { contentNotFound } from '@kobato/server/http/content-not-found'
import { mediaFileAnswer } from '@kobato/server/http/media-resource'
import { implementPublic, localizedOrpcError, localizedOrpcErrorDescriptor } from '@kobato/server/http/orpc-base'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DEFAULT_PUBLIC_CACHE_CONTROL, contentTypeForKey } from '@kobato/server/infra/storage/key-policy'

const impl = implementPublic(fontsContract)

function badPath(context: HandlerContext): never {
  throw localizedOrpcError(context, 'BAD_REQUEST', 'error.api.badRequest')
}

const embedded = impl.embedded.handler(async ({ input, context }): Promise<EmbeddedFontOutput> => {
  let pathname: string
  try {
    pathname = decodeURIComponent(input.path)
  } catch {
    badPath(context)
  }
  const parsed = parseAssetUrlPath(pathname)
  if (parsed === null || parsed.route !== EMBEDDED_FONT_ROUTE_PREFIX) {
    badPath(context)
  }
  const storageKey = parsed.key

  const redirect = s3StorageRedirect(storageKey, input.search ?? '', context.settings)
  if (redirect === 'unavailable') {
    throw localizedOrpcErrorDescriptor(context, 'SERVICE_UNAVAILABLE', descriptorFor('storage.error.unavailable'))
  }
  if (redirect !== null) {
    return redirect
  }

  const lookup = await lookupStoredLocalObject(storageKey, 'fonts.embedded.http', 'embedded font file')
  if (lookup === 'invalid-path') {
    badPath(context)
  }
  if (lookup === 'missing') {
    contentNotFound()
  }

  const answer = mediaFileAnswer(
    lookup,
    { ifNoneMatch: input.ifNoneMatch, range: input.range },
    { contentType: contentTypeForKey(storageKey), cacheControl: DEFAULT_PUBLIC_CACHE_CONTROL },
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

export const fontsRouter = impl.router({
  embedded,
})
