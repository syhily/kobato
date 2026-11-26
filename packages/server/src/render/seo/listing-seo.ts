import type { ListingPageLoaderData } from '@kobato/catalog/listing'
import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { type FeedLinkOptions, routeMeta } from '@kobato/catalog/seo/meta'
import { pagePath } from '@kobato/server/domains/content/urls'
import { createServerTranslator } from '@kobato/server/infra/i18n'

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
): ListingPageLoaderData['seo'] {
  let pageTitle = title
  if (pageNum > 1) {
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
