import type { ListingPostCardWithMetadata } from '@kobato/contracts/types/catalog.ts'

import { cn } from '@kobato/ui/lib/cn.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { formatDate } from '@kobato/utils/format.ts'
import { localDateParts } from '@kobato/utils/formatter.ts'
import { useSiteIdentity } from '@kobato/web/client/settings/blog-settings-context.tsx'
import { postTitleClass } from '@kobato/web/ui/public/post/postChrome.ts'
import { PostSquare } from '@kobato/web/ui/public/post/PostListViews.tsx'

export interface ArchivesBodyProps {
  resolvedPosts: ListingPostCardWithMetadata[]
  listingNowIso: string
}

export function ArchivesBody({ resolvedPosts, listingNowIso }: ArchivesBodyProps) {
  const { locale, timeZone } = useSiteIdentity()
  const { t } = useI18n()
  // Bucket by the site-configured time zone (same path as the displayed
  // dates), so SSR and hydration always agree on the group keys.
  const groupedPosts = Object.groupBy(resolvedPosts, (post) => {
    const parts = localDateParts(new Date(post.date), locale, timeZone)
    // Month heading in the site locale, derived from the same zoned bucket parts.
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
        // Object.groupBy only emits keys that have at least one item.
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
