import type { ListingPostCardWithMetadata } from '@kobato/catalog/model'

import { formatDate } from '@kobato/base/utils/format'
import { localDateParts } from '@kobato/base/utils/site-date'
import { useSiteIdentity } from '@kobato/ui/lib/blog-settings-context'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { postTitleClass } from '@sayaka/ui/post/postChrome'
import { PostSquare } from '@sayaka/ui/post/PostListViews'

export interface ArchivesBodyProps {
  resolvedPosts: ListingPostCardWithMetadata[]
  listingNowIso: string
}

export function ArchivesBody({ resolvedPosts, listingNowIso }: ArchivesBodyProps) {
  const { locale, timeZone } = useSiteIdentity()
  const { t } = useI18n()
  const groupedPosts = Object.groupBy(resolvedPosts, (post) => {
    const parts = localDateParts(new Date(post.date), locale, timeZone)
    return formatDate(new Date(Date.UTC(parts.year, parts.month - 1, 1)), {
      locale,
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
    })
  })

  return (
    <div className="py-4 md:py-6 lg:px-2 2xl:px-12 2xl:py-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="mb-4 lg:mb-6">
          <h1 className={cn(postTitleClass, 'font-bold')}>
            {t('public.posts.total', { count: resolvedPosts.length })}
          </h1>
        </div>
      </div>
      {Object.entries(groupedPosts).map(([key, posts]) => {
        if (posts === undefined) {
          return null
        }
        return (
          <div key={key} className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
            <div className="mb-12">
              <div className="mb-4 lg:mb-6">
                <h2 className="text-xl font-bold md:text-2xl">{key}</h2>
                <div className="mt-1 text-ink-4">{t('public.posts.monthTotal', { count: posts.length })}</div>
              </div>
              <div className="-mx-1 -mt-2 flex flex-wrap md:-mx-2 md:-mt-4 2xl:-mx-3 2xl:-mt-6">
                {posts.map((post, i) => (
                  <PostSquare key={post.slug} post={post} first={i === 0} listingNowIso={listingNowIso} />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
