import type { ListingPostCardWithMetadata } from '@kobato/shared/types/catalog'

import { groupBy } from '@kobato/shared/utils/tools'
import { cn } from '@kobato/ui/lib/cn'
import { postTitleClass } from '@kobato/ui/public/post/postChrome'
import { PostSquare } from '@kobato/ui/public/post/PostListViews'

export interface ArchivesBodyProps {
  resolvedPosts: ListingPostCardWithMetadata[]
  listingNowIso: string
}

export function ArchivesBody({ resolvedPosts, listingNowIso }: ArchivesBodyProps) {
  const groupedPosts = groupBy(resolvedPosts, (post) => {
    const date = new Date(post.date)
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
  })

  return (
    <div className="py-4 md:py-6 lg:px-2 2xl:px-12 2xl:py-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="mb-4 lg:mb-6">
          <h1 className={cn(postTitleClass, 'font-bold')}>共 {resolvedPosts.length} 篇文章</h1>
        </div>
      </div>
      {Object.entries(groupedPosts).map(([key, posts]) => (
        <div key={key} className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
          <div className="mb-12">
            <div className="mb-4 lg:mb-6">
              <h2 className="text-xl font-bold md:text-2xl">{key}</h2>
              <div className="mt-1 text-ink-4">本月累计 {posts.length} 篇</div>
            </div>
            <div className="-mx-1 -mt-2 flex flex-wrap md:-mx-2 md:-mt-4 2xl:-mx-3 2xl:-mt-6">
              {posts.map((post, i) => (
                <PostSquare key={post.slug} post={post} first={i === 0} listingNowIso={listingNowIso} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
