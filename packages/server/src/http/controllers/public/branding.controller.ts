import { brandingContract } from '@kobato/api/rpc/public/branding'
import { ASSET_ROUTES, resolveSiteAsset } from '@kobato/server/domains/assets/services/routes'
import { contentNotFound } from '@kobato/server/http/content-not-found'
import { implementPublic } from '@kobato/server/http/orpc-base'
import { etagHeaderMatches } from '@kobato/server/infra/http/etag'

const impl = implementPublic(brandingContract)

const ASSET_CACHE_CONTROL = 'public, max-age=3600, must-revalidate'

const asset = impl.asset.handler(async ({ input }) => {
  if (!(input.path in ASSET_ROUTES)) {
    contentNotFound()
  }
  const resolved = await resolveSiteAsset(input.path, { original: input.original === true })
  if (!resolved) {
    contentNotFound()
  }
  const etag = `"${resolved.etag}"`
  if (etagHeaderMatches(input.ifNoneMatch, etag)) {
    return {
      kind: 'not-modified' as const,
      etag,
      contentType: resolved.contentType,
      cacheControl: ASSET_CACHE_CONTROL,
      contentLanguage: null,
    }
  }
  return {
    kind: 'ok' as const,
    body: new Blob([new Uint8Array(resolved.content)], { type: resolved.contentType }),
    etag,
    contentType: resolved.contentType,
    cacheControl: ASSET_CACHE_CONTROL,
    contentLanguage: null,
  }
})

export const brandingRouter = impl.router({
  asset,
})
