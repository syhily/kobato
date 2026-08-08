import type { Database } from '@/server/infra/db/database'
import type { FeedLinkOptions } from '@/shared/seo/meta'
import type { ListingPostCard } from '@/shared/types/catalog'
import type { ListingExtraArgs, ListingPageLoaderData } from '@/shared/types/listing'

import { getClientPostsWithMetadata } from '@/server/domains/posts/services/public-query'
import { parseListingPage, redirectListingOverflow } from '@/server/http/loaders/pagination'
import { listingSeo } from '@/server/render/seo/listing-seo'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Per-page metadata fan-out; home overrides to also pull comment counts (card badges).
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

// 'skip-on-first-page': home omits page-1 SEO so `/` ships a minimal payload.
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

// Shared skeleton for listing routes: slice & resolve posts, overflow
// redirect, canonical/prev/next SEO. `computeExtra` runs per-route work
// alongside the shared pipeline.
export async function listingLoader<TExtra = undefined>(
  db: Database,
  {
    rawNum,
    totalPosts,
    fetchPage,
    rootPath,
    title,
    description,
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
    pageSize?: number
    /** Tail-merge guard: an orphan last page (< M posts) is absorbed into its predecessor. */
    mergeTailWhenLessThan?: number
    forceNoindex?: boolean
    metadata?: ListingMetadataFlags
    seoMode?: ListingSeoMode
    /** Scoped feed links (per-category/tag RSS) advertised alongside the site-wide feeds. */
    feedLinks?: FeedLinkOptions
    /** Custom OG image URL for the listing page. */
    ogImageUrl?: string
    /** Async per-route `extra` producer — runs after overflow redirects, sees the in-page slice only. */
    computeExtra?: (args: ListingExtraArgs) => Promise<TExtra> | TExtra
    /** Static extra payload, used when no async work is needed. */
    extra?: TExtra
    /** Allow an empty catalog to render instead of 404 (home empty-state CTA). */
    allowEmpty?: boolean
  },
): Promise<ListingPageLoaderData<TExtra>> {
  const listingNowIso = new Date().toISOString()
  const pageNum = parseListingPage(rawNum, rootPath)
  const effectivePageSize = pageSize ?? requireBlogSettingsSection('content').pagination.posts
  const totalPage = calculateTotalPages(totalPosts, effectivePageSize, mergeTailWhenLessThan ?? 0)

  redirectListingOverflow(rawNum, pageNum, totalPage, rootPath, allowEmpty)

  const currentPosts =
    totalPage === 0 || pageNum > totalPage
      ? []
      : await fetchPage({
          pageNum,
          // On the last page, expand the limit so tail-merged posts aren't truncated.
          limit: pageNum === totalPage ? totalPosts - (pageNum - 1) * effectivePageSize : effectivePageSize,
          // The offset always follows the stable configured page size, even when the final limit expands.
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
