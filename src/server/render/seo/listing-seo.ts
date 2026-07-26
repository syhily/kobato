import type { MetaDescriptor } from 'react-router'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { type FeedLinkOptions, routeMeta } from '@/shared/seo/meta'
import { pagePath } from '@/shared/utils/paths'

export interface ListingSeoProps {
  title?: string
  description?: string
  pageNum: number
  totalPage: number
  rootPath: string
  forceNoindex?: boolean
  /**
   * Optional scoped RSS/Atom links emitted as additional
   * `<link rel="alternate">` entries (in addition to the site-wide feeds).
   * Used by category and tag listings to advertise their dedicated feeds.
   */
  feedLinks?: FeedLinkOptions
  /** Custom OG image URL; when omitted falls back to the site-wide default. */
  ogImageUrl?: string
}

// Produces the complete `MetaDescriptor[]` for a listing page in one call
// so loaders ship the final tags over the wire; each route's `meta()` then
// returns `loaderData?.seo ?? routeMeta()`.
//
// `bundle` is optional: loaders read the boot-hydrated snapshot, but a
// caller (e.g. a `meta()` callback that already extracted the bundle from
// `matches`) can pass it explicitly to avoid touching `globalThis`.
export function listingSeo(
  { title, description, pageNum, totalPage, rootPath, forceNoindex = false, feedLinks, ogImageUrl }: ListingSeoProps,
  bundle?: BlogSettingsBundle | null,
): MetaDescriptor[] {
  let pageTitle = title
  if (pageNum > 1) {
    pageTitle = title === undefined ? `第 ${pageNum} 页` : `${title} · 第 ${pageNum} 页`
  }

  return routeMeta(
    {
      title: pageTitle,
      description,
      pageUrl: pagePath(rootPath, pageNum),
      ogImageUrl,
      canonical: true,
      prevUrl: pageNum > 1 ? pagePath(rootPath, pageNum - 1) : undefined,
      nextUrl: pageNum < totalPage ? pagePath(rootPath, pageNum + 1) : undefined,
      noindex: forceNoindex || pageNum > 1,
      feedLinks,
    },
    bundle,
  )
}
