import { redirect } from 'react-router'

import type { AuditContext } from '@/server/domains/audit/types'
import type { Database } from '@/server/infra/db/database'
import type { ListingPageLoaderData } from '@/shared/types/listing'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { livePostWhere } from '@/server/domains/posts/live-gate'
import { getClientPostsWithMetadata, getPostsBySlugs } from '@/server/domains/posts/services/public-query'
import { parseListingPage } from '@/server/http/loaders/pagination'
import { searchPostOptions } from '@/server/infra/search/options'
import { searchPosts } from '@/server/infra/search/search'
import { listingSeo } from '@/server/render/seo/listing-seo'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { toClientPost, toListingPostCard } from '@/shared/types/catalog'
import { pagePath, searchRootPath } from '@/shared/utils/paths'

export interface SearchLoaderOptions {
  keyword: string | undefined
  num: string | undefined
  forceNoindex?: boolean
  /** Canonical request facts; when present, a `search` audit event is recorded. */
  auditContext?: AuditContext
}
export async function searchLoader(
  db: Database,
  { keyword, num, forceNoindex = true, auditContext }: SearchLoaderOptions,
): Promise<ListingPageLoaderData> {
  const listingNowIso = new Date().toISOString()
  const query = keyword?.trim() ?? ''
  if (query === '') {
    throw redirect('/')
  }
  const rootPath = searchRootPath(query)
  const pageNum = parseListingPage(num, rootPath)
  const pageSize = requireBlogSettingsSection('content').pagination.search
  // Only live posts are searchable — the gate is defined once in
  // `@/server/domains/content/schemas/live-gate`, bound to the post columns by
  // `livePostWhere`, and passed down so the search infra stays free of
  // business rules.
  const liveWhere = livePostWhere()
  const { hits, page, totalPages } = await searchPosts(db, liveWhere, query, pageSize, (pageNum - 1) * pageSize)
  if (auditContext !== undefined) {
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
  const title = `【${query}】搜索结果`
  const seo = listingSeo({
    title,
    pageNum: page,
    totalPage: totalPages,
    rootPath,
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
