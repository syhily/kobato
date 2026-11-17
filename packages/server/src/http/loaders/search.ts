import type { BlogSettingsBundle } from '@kobato/shared/config/types.ts'
import type { AppLocale } from '@kobato/shared/i18n/locales.ts'
import type { ListingPageLoaderData } from '@kobato/shared/types/listing.ts'

import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { SEARCH_KEYWORD_MAX_LENGTH } from '@kobato/shared/contracts/content.ts'
import { toClientPost, toListingPostCard } from '@kobato/shared/types/catalog.ts'
import { pagePath, searchRootPath } from '@kobato/shared/utils/paths.ts'
import { redirect } from 'react-router'

import type { AuditContext } from '../../domains/audit/types'
import type { Database } from '../../infra/db/database'

import { recordAuditEventFromContext } from '../../domains/audit/services/record'
import { livePostWhere } from '../../domains/posts/live-gate'
import { getClientPostsWithMetadata, getPostsBySlugs } from '../../domains/posts/services/public-query'
import { createServerTranslator } from '../../infra/i18n'
import { searchPostOptions } from '../../infra/search/options'
import { searchPosts } from '../../infra/search/search'
import { listingSeo } from '../../render/seo/listing-seo'
import { parseListingPage } from './pagination'

export interface SearchLoaderOptions {
  keyword: string | undefined
  num: string | undefined
  /** Request UI locale — the result-page title is rendered server-side. */
  locale: AppLocale
  /** Request-pinned settings bundle — the same capture the caller renders with. */
  settings: BlogSettingsBundle | null
  forceNoindex?: boolean
  /** Canonical request facts; when present, a `search` audit event is recorded. */
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
  // Only live posts are searchable — the gate is defined once and passed
  // down, keeping the search infra free of business rules.
  const liveWhere = livePostWhere()
  const { hits, page, totalPages } = await searchPosts(db, liveWhere, query, pageSize, (pageNum - 1) * pageSize)
  // The audit row persists the raw keyword — never write one for a blank or
  // over-cap query (the contract cap makes the latter unreachable over RPC;
  // the guard keeps this loader honest on its own).
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
