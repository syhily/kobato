import { sitemapContract } from '@kobato/api/rpc/public/sitemap'
import { implementPublic, rateLimitByIp } from '@kobato/server/http/orpc-base'
import { through } from '@kobato/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag'
import { buildSitemapXml } from '@kobato/server/render/seo/sitemap'

const impl = implementPublic(sitemapContract)

const SITEMAP_CACHE_CONTROL = 'public, no-cache'

const xml = impl.xml.use(rateLimitByIp('sitemap', 'resource')).handler(async ({ input, context }) => {
  const xmlBody = await through('sitemap', { settingsRevision: context.localization.revisions.sitemap }, () =>
    buildSitemapXml(context.db, context.settings),
  )
  const etag = contentEtag(xmlBody)
  if (etagHeaderMatches(input.ifNoneMatch, etag)) {
    return {
      kind: 'not-modified' as const,
      etag,
      contentType: 'application/xml; charset=utf-8',
      cacheControl: SITEMAP_CACHE_CONTROL,
      contentLanguage: null,
    }
  }
  return {
    kind: 'ok' as const,
    body: xmlBody,
    etag,
    contentType: 'application/xml; charset=utf-8',
    cacheControl: SITEMAP_CACHE_CONTROL,
    contentLanguage: null,
  }
})

export const sitemapRouter = impl.router({ xml })
