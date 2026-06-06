import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { redirect } from 'react-router'

import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { getClientPostsWithMetadata } from '@/server/domains/posts/repos/public-query/listing'
import { getPostsBySlugs } from '@/server/domains/posts/repos/public-query/misc'
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
  clientAddress?: string
  request?: Request
}
export async function searchLoader(
  db: NodePgDatabase,
  pool: Pool,
  { keyword, num, forceNoindex = true, clientAddress, request }: SearchLoaderOptions,
): Promise<ListingPageLoaderData> {
  const listingNowIso = new Date().toISOString()
  const query = keyword?.trim() ?? ''
  if (query === '') {
    throw redirect('/')
  }
  const rootPath = searchRootPath(query)
  const pageNum = parseListingPage(num, rootPath)
  const pageSize = requireBlogSettingsSection('content').pagination.search
  const { hits, page, totalPages } = await searchPosts(db, query, pageSize, (pageNum - 1) * pageSize)
  if (request !== undefined) {
    recordAuditEvent({
      action: 'search',
      resourceType: 'search',
      details: { keyword: query, resultCount: hits.length },
      ipAddress: clientAddress ?? null,
      userAgent: request.headers.get('User-Agent') ?? null,
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
