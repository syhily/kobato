import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'
import type { MetaDescriptor } from 'react-router'

import { type FeedLinkOptions, routeMeta } from '@kobato/seo/meta.ts'
import { pagePath } from '@kobato/server/domains/content/urls.ts'
import { createServerTranslator } from '@kobato/server/infra/i18n.ts'

export interface ListingSeoProps {
  title?: string
  description?: string
  pageNum: number
  totalPage: number
  rootPath: string
  locale: AppLocale
  forceNoindex?: boolean
  feedLinks?: FeedLinkOptions
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
