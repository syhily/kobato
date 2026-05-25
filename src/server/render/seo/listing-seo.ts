import type { MetaDescriptor } from 'react-router'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { type FeedLinkOptions, routeMeta } from '@/server/render/seo/meta'
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
}

// Produces the **complete** `MetaDescriptor[]` for a listing page in one
// call so loaders can ship the final tags over the wire. Each route's
// `meta()` then becomes a one-liner that returns `loaderData?.seo ?? routeMeta()`,
// avoiding the previous double-projection through a `ListingSeoPayload`
// shape (and the routeMeta call duplicated in every meta function).
//
// `bundle` is optional: in loaders we always have the boot-hydrated
// snapshot to read from, but a caller (e.g. a `meta()` callback that
// already extracted the bundle from `matches`) can pass it explicitly
// to avoid touching `globalThis`.
export function listingSeo(
  { title, description, pageNum, totalPage, rootPath, forceNoindex = false, feedLinks }: ListingSeoProps,
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
      canonical: true,
      prevUrl: pageNum > 1 ? pagePath(rootPath, pageNum - 1) : undefined,
      nextUrl: pageNum < totalPage ? pagePath(rootPath, pageNum + 1) : undefined,
      noindex: forceNoindex || pageNum > 1,
      feedLinks,
    },
    bundle,
  )
}
