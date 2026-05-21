import { redirect } from 'react-router'

import type { ListingPageLoaderData } from '@/server/http/loaders/listing'

import { recordAuditEvent } from '@/server/domains/audit/service'
import { getClientPostsWithMetadata, getPostsBySlugs } from '@/server/domains/posts/repo'
import { parseListingPage } from '@/server/http/loaders/pagination'
import { searchPostOptions } from '@/server/infra/search/options'
import { searchPosts } from '@/server/infra/search/search'
import { listingSeo } from '@/server/render/seo/listing-seo'
import { requireBlogSettingsSection } from '@/shared/config/blog'
import { toClientPost, toListingPostCard } from '@/shared/types/catalog'
import { pagePath, searchRootPath } from '@/shared/utils/paths'

export interface SearchLoaderOptions {
  keyword: string | undefined
  num: string | undefined
  forceNoindex?: boolean
  clientAddress?: string
  request?: Request
}
export async function searchLoader({
  keyword,
  num,
  forceNoindex = true,
  clientAddress,
  request,
}: SearchLoaderOptions): Promise<ListingPageLoaderData> {
  const listingNowIso = new Date().toISOString()
  const query = keyword?.trim() ?? ''
  if (query === '') {
    throw redirect('/')
  }
  const rootPath = searchRootPath(query)
  const pageNum = parseListingPage(num, rootPath)
  const pageSize = requireBlogSettingsSection('content').pagination.search
  const { hits, page, totalPages } = await searchPosts(query, pageSize, (pageNum - 1) * pageSize)
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
  const hitPosts = await getPostsBySlugs(hits, searchPostOptions())
  const posts = hitPosts.map((p) => toListingPostCard(toClientPost(p)))
  const resolvedPosts = await getClientPostsWithMetadata(posts, {
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
