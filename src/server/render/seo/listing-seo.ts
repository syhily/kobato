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
  /** Scoped RSS/Atom `<link rel="alternate">` entries for category/tag listings. */
  feedLinks?: FeedLinkOptions
  /** Custom OG image URL; when omitted falls back to the site-wide default. */
  ogImageUrl?: string
}

// One call produces the full MetaDescriptor[] for a listing; `bundle`
// is optional to avoid touching globalThis when the caller has it.
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
