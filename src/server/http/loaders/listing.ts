import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { MetaDescriptor } from 'react-router'

import type { FeedLinkOptions } from '@/shared/seo/meta'
import type { ListingPostCard, ListingPostCardWithMetadata } from '@/shared/types/catalog'

import { getClientPostsWithMetadata } from '@/server/domains/posts/repos/public-query/listing'
import { parseListingPage, redirectListingOverflow } from '@/server/http/loaders/pagination'
import { listingSeo } from '@/server/render/seo/listing-seo'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Shared loader-return shape for every listing route (`/`, `/cats/:slug`,
// `/tags/:slug`, `/search/:keyword`). Components destructure the same fields
// regardless of which loader produced the data. `extra` is a per-route slot
// for sidebar/feature data that doesn't fit the generic listing contract.
export interface ListingPageLoaderData<TExtra = undefined> {
  pageNum: number
  totalPage: number
  rootPath: string
  resolvedPosts: ListingPostCardWithMetadata[]
  title?: string
  description?: string
  /** Pre-computed `MetaDescriptor[]` ready to return from `meta()`. */
  seo: MetaDescriptor[]
  extra: TExtra
  /** ISO instant captured once per loader run; thread into `formatShowDate` so SSR matches hydration. */
  listingNowIso: string
}

// Per-page metadata fan-out. Defaults match the historical category/tag
// listing behaviour (likes + views, no comment count). Home overrides this
// to also pull comment counts (cards on `/` show the comment-bubble badge).
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

// Page-1 SEO behaviour. The historical category/tag listings always emit
// canonical/prev/next, but the home page deliberately skips SEO on page 1 so
// the most-visited URL ships the smallest possible MetaDescriptor payload
// (the root `meta()` already provides the site default).
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

// Listing routes (`/`, `/cats/:slug`, `/tags/:slug`) share the same loader
// skeleton: slice & resolve posts, redirect on overflow, and emit canonical/
// prev/next SEO. This helper centralises the pattern so each route only
// carries the params-to-filter mapping plus its body props.
//
// `extra` is computed via an optional async callback so the per-route work
// (sidebar / feature posts / category-link map) can run alongside the
// shared post-resolution pipeline without forcing every caller to duplicate
// the slice/hydrate dance.
//
// Lives under `src/server/` so SSR-only catalog / metadata imports never reach
// the client bundle.
export async function listingLoader<TExtra = undefined>(
  db: NodePgDatabase,
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
    /**
     * Optional tail-merge guard. When set to a positive integer M and the
     * natural last page would render fewer than M posts, that last page is
     * merged into its predecessor i.e. the predecessor absorbs the orphan
     * posts via the existing "the last page is open-ended" branch below.
     * The result is a smaller totalPage and a fatter last page; the route
     * helper then 301-redirects any out-of-range :num back to the new last
     * page through the shared overflow handler.
     */
    mergeTailWhenLessThan?: number
    forceNoindex?: boolean
    metadata?: ListingMetadataFlags
    seoMode?: ListingSeoMode
    /**
     * Optional scoped feed links (e.g. per-category or per-tag RSS/Atom URLs)
     * forwarded to `listingSeo` so the rendered head advertises them as
     * `<link rel="alternate">` entries alongside the site-wide feeds.
     */
    feedLinks?: FeedLinkOptions
    /** Custom OG image URL for the listing page. */
    ogImageUrl?: string
    /**
     * Async callback that produces the per-route `extra` payload from the
     * resolved page slice. Runs after pagination/overflow redirects so the
     * caller only sees the in-page slice that will actually render.
     */
    computeExtra?: (args: ListingExtraArgs) => Promise<TExtra> | TExtra
    /** Static extra payload, used when no async work is needed. */
    extra?: TExtra
    /**
     * When `true`, an empty catalog (zero posts) is allowed to render instead
     * of throwing a 404. Used by the home page so a fresh blog can show a
     * friendly empty-state CTA.
     */
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

export interface ListingExtraArgs<TPost = ListingPostCardWithMetadata> {
  resolvedPosts: TPost[]
  pageNum: number
  totalPage: number
}
