import type { ListingExtraArgs, ListingPageLoaderData } from '@kobato/catalog/listing'
import type { ListingPostCard } from '@kobato/catalog/model'
import type { FeedLinkOptions } from '@kobato/catalog/seo/meta'
import type { Database } from '@kobato/db/sqlite/database'
import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { getClientPostsWithMetadata } from '@kobato/server/domains/posts/services/public-query'
import { parseListingPage, redirectListingOverflow } from '@kobato/server/http/loaders/pagination'
import { listingSeo } from '@kobato/server/render/seo/listing-seo'
import { requireBlogSettingsSection } from '@kobato/settings/getters'

export interface ListingMetadataFlags {
  likes?: boolean
  views?: boolean
  comments?: boolean
}

const DEFAULT_LISTING_METADATA: Required<ListingMetadataFlags> = {
  likes: true,
  views: true,
  comments: false,
}

export type ListingSeoMode = 'always' | 'skip-on-first-page'

interface ListingPageRequest {
  pageNum: number
  limit: number
  offset: number
}

function calculateTotalPages(postCount: number, pageSize: number, mergeTailThreshold: number): number {
  const naturalTotalPage = Math.ceil(postCount / pageSize)
  if (mergeTailThreshold <= 0 || naturalTotalPage < 2) {
    return naturalTotalPage
  }
  const tailSize = postCount - (naturalTotalPage - 1) * pageSize
  if (tailSize < mergeTailThreshold) {
    return naturalTotalPage - 1
  }
  return naturalTotalPage
}

export async function listingLoader<TExtra = undefined>(
  db: Database,
  {
    rawNum,
    totalPosts,
    fetchPage,
    rootPath,
    title,
    description,
    locale,
    settings,
    pageSize,
    mergeTailWhenLessThan,
    forceNoindex,
    metadata,
    seoMode = 'always',
    feedLinks,
    ogImageUrl,
    computeExtra,
    extra,
    allowEmpty,
  }: {
    rawNum: string | undefined
    totalPosts: number
    fetchPage: (request: ListingPageRequest) => Promise<ListingPostCard[]>
    rootPath: string
    title?: string
    description?: string
    locale: AppLocale
    settings: BlogSettingsBundle | null
    pageSize?: number
    mergeTailWhenLessThan?: number
    forceNoindex?: boolean
    metadata?: ListingMetadataFlags
    seoMode?: ListingSeoMode
    feedLinks?: FeedLinkOptions
    ogImageUrl?: string
    computeExtra?: (args: ListingExtraArgs) => Promise<TExtra> | TExtra
    extra?: TExtra
    allowEmpty?: boolean
  },
): Promise<ListingPageLoaderData<TExtra>> {
  const listingNowIso = new Date().toISOString()
  const pageNum = parseListingPage(rawNum, rootPath)
  const effectivePageSize = pageSize ?? requireBlogSettingsSection('content', settings).pagination.posts
  const totalPage = calculateTotalPages(totalPosts, effectivePageSize, mergeTailWhenLessThan ?? 0)

  redirectListingOverflow(rawNum, pageNum, totalPage, rootPath, allowEmpty)

  const currentPosts =
    totalPage === 0 || pageNum > totalPage
      ? []
      : await fetchPage({
          pageNum,
          limit: pageNum === totalPage ? totalPosts - (pageNum - 1) * effectivePageSize : effectivePageSize,
          offset: (pageNum - 1) * effectivePageSize,
        })

  const resolvedPosts = await getClientPostsWithMetadata(db, currentPosts, {
    ...DEFAULT_LISTING_METADATA,
    ...metadata,
  })

  const resolvedExtra: TExtra =
    computeExtra !== undefined ? await computeExtra({ resolvedPosts, pageNum, totalPage }) : extra!

  const seo =
    seoMode === 'skip-on-first-page' && pageNum === 1
      ? []
      : listingSeo({
          title,
          description,
          pageNum,
          totalPage,
          rootPath,
          locale,
          forceNoindex,
          feedLinks,
          ogImageUrl,
        })

  return {
    pageNum,
    totalPage,
    rootPath,
    resolvedPosts,
    title,
    description,
    seo,
    extra: resolvedExtra,
    listingNowIso,
  }
}
