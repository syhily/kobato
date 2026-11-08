import type { MetaDescriptor } from 'react-router'

import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'

import { createServerTranslator } from '@/server/infra/i18n'
import { type FeedLinkOptions, routeMeta } from '@/shared/seo/meta'
import { pagePath } from '@/shared/utils/paths'

export interface ListingSeoProps {
  title?: string
  description?: string
  pageNum: number
  totalPage: number
  rootPath: string
  /** Request UI locale — pagination copy is system text, never content. */
  locale: AppLocale
  forceNoindex?: boolean
  /** Scoped RSS/Atom `<link rel="alternate">` entries for category/tag listings. */
  feedLinks?: FeedLinkOptions
  /** Custom OG image URL; when omitted falls back to the site-wide default. */
  ogImageUrl?: string
}

// One call produces the full MetaDescriptor[] for a listing; `bundle`
// is optional to avoid touching globalThis when the caller has it.
export function listingSeo(
  {
    title,
    description,
    pageNum,
    totalPage,
    rootPath,
    locale,
    forceNoindex = false,
    feedLinks,
    ogImageUrl,
  }: ListingSeoProps,
  bundle?: BlogSettingsBundle | null,
): MetaDescriptor[] {
  let pageTitle = title
  if (pageNum > 1) {
    // System copy resolved per request — never a hardcoded zh-CN template.
    const t = createServerTranslator(locale)
    pageTitle =
      title === undefined
        ? t.format('meta.listing.page', { page: pageNum })
        : t.format('meta.listing.titleWithPage', { title, page: pageNum })
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
