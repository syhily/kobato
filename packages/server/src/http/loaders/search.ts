import type { ContentRedirectSignal } from '@kobato/api/contracts/public/content'
import type { ListingPageLoaderData } from '@kobato/catalog/listing'
import type { Database } from '@kobato/db/sqlite/database'
import type { AppLocale } from '@kobato/i18n/locales'
import type { AuditContext } from '@kobato/server/domains/audit/types'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { SEARCH_KEYWORD_MAX_LENGTH, isContentRedirectSignal } from '@kobato/api/contracts/public/content'
import { toClientPost, toListingPostCard } from '@kobato/catalog/projection'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { pagePath, searchRootPath } from '@kobato/server/domains/content/urls'
import { getClientPostsWithMetadata, getPostsBySlugs } from '@kobato/server/domains/posts/services/public-query'
import { searchPostOptions, searchPosts } from '@kobato/server/domains/posts/services/search-query'
import { parseListingPage } from '@kobato/server/http/loaders/pagination'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { listingSeo } from '@kobato/server/render/seo/listing-seo'
import { requireBlogSettingsSection } from '@kobato/settings/getters'

export interface SearchLoaderOptions {
  keyword: string | undefined
  num: string | undefined
  locale: AppLocale
  settings: BlogSettingsBundle | null
  forceNoindex?: boolean
  auditContext?: AuditContext
}
export async function searchLoader(
  db: Database,
  { keyword, num, locale, settings, forceNoindex = true, auditContext }: SearchLoaderOptions,
): Promise<ListingPageLoaderData | ContentRedirectSignal> {
  const listingNowIso = new Date().toISOString()
  const query = keyword?.trim() ?? ''
  if (query === '') {
    return { kind: 'redirect', to: '/', status: 302 }
  }
  const rootPath = searchRootPath(query)
  const parsedPage = parseListingPage(num, rootPath)
  if (isContentRedirectSignal(parsedPage)) {
    return parsedPage
  }
  const pageNum = parsedPage
  const pageSize = requireBlogSettingsSection('content', settings).pagination.search
  const { hits, page, totalPages } = await searchPosts(db, query, pageSize, (pageNum - 1) * pageSize)
  if (auditContext !== undefined && query.length > 0 && query.length <= SEARCH_KEYWORD_MAX_LENGTH) {
    recordAuditEventFromContext(auditContext, {
      action: 'search',
      resourceType: 'search',
      details: { keyword: query, resultCount: hits.length },
    })
  }
  if (num !== undefined) {
    if (totalPages === 0) {
      return { kind: 'redirect', to: '/', status: 302 }
    }
    if (pageNum > totalPages) {
      return { kind: 'redirect', to: pagePath(rootPath, totalPages), status: 302 }
    }
  }
  const hitPosts = await getPostsBySlugs(db, hits, searchPostOptions())
  const posts = hitPosts.map((p) => toListingPostCard(toClientPost(p)))
  const resolvedPosts = await getClientPostsWithMetadata(db, posts, {
    likes: true,
    views: true,
    comments: false,
  })
  const title = createServerTranslator(locale).format('public.search.resultTitle', { query })
  const seo = listingSeo({
    title,
    pageNum: page,
    totalPage: totalPages,
    rootPath,
    locale,
    forceNoindex,
  })
  return {
    pageNum: page,
    totalPage: totalPages,
    rootPath,
    resolvedPosts,
    title,
    seo,
    extra: undefined,
    listingNowIso,
  }
}
