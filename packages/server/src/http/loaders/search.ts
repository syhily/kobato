import type { ListingPageLoaderData } from '@kobato/catalog/listing.ts'
import type { Database } from '@kobato/db/database.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { AuditContext } from '@kobato/server/domains/audit/types.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { toClientPost, toListingPostCard } from '@kobato/catalog/projection.ts'
import { SEARCH_KEYWORD_MAX_LENGTH } from '@kobato/contracts/content.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { pagePath, searchRootPath } from '@kobato/server/domains/content/urls.ts'
import { livePostWhere } from '@kobato/server/domains/posts/live-gate.ts'
import { getClientPostsWithMetadata, getPostsBySlugs } from '@kobato/server/domains/posts/services/public-query.ts'
import { searchPostOptions, searchPosts } from '@kobato/server/domains/posts/services/search-query.ts'
import { parseListingPage } from '@kobato/server/http/loaders/pagination.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { listingSeo } from '@kobato/server/render/seo/listing-seo.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { redirect } from 'react-router'

export interface SearchLoaderOptions {
  keyword: string | undefined
  num: string | undefined
  locale: AppLocale
  /** Request-pinned settings bundle — the same capture the caller renders with. */
  settings: BlogSettingsBundle | null
  forceNoindex?: boolean
  auditContext?: AuditContext
}
export async function searchLoader(
  db: Database,
  { keyword, num, locale, settings, forceNoindex = true, auditContext }: SearchLoaderOptions,
): Promise<ListingPageLoaderData> {
  const listingNowIso = new Date().toISOString()
  const query = keyword?.trim() ?? ''
  if (query === '') {
    throw redirect('/')
  }
  const rootPath = searchRootPath(query)
  const pageNum = parseListingPage(num, rootPath)
  const pageSize = requireBlogSettingsSection('content', settings).pagination.search
  const liveWhere = livePostWhere()
  const { hits, page, totalPages } = await searchPosts(db, liveWhere, query, pageSize, (pageNum - 1) * pageSize)
  if (auditContext !== undefined && query.length > 0 && query.length <= SEARCH_KEYWORD_MAX_LENGTH) {
    recordAuditEventFromContext(auditContext, {
      action: 'search',
      resourceType: 'search',
      details: { keyword: query, resultCount: hits.length },
    })
  }
  if (num !== undefined) {
    if (totalPages === 0) {
      throw redirect('/', { status: 302 })
    }
    if (pageNum > totalPages) {
      throw redirect(pagePath(rootPath, totalPages))
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
