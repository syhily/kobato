import type { Friend } from '@/shared/types/catalog'

import { shuffle } from '@/shared/utils/tools'
import { Image } from '@/ui/public/widgets/Image'

export interface FriendsProps {
  friends: Friend[]
}

export function Friends({ friends }: FriendsProps) {
  const list = shuffle(
    [...friends],
    `friends:${friends.map((friend) => `${friend.website}:${friend.homepage}`).join('|')}`,
  )

  if (list.length === 0) {
    return (
      <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
        <div className="my-auto">
          <div>还没有友链呢...😭</div>
        </div>
      </div>
    )
  }

  return (
    <div className="not-prose mt-10 px-4 md:mt-8 md:px-0">
      <h2 className="mb-6 text-xl text-ink-4 md:mb-4 md:text-2xl">
        左邻右舍 <span className="mb-6 text-sm text-brand md:mb-4">排名不分前后</span>
      </h2>
      <div className="-mx-2 -mt-4 flex flex-wrap md:-mx-3 md:-mt-6">
        {list.map((friend) => (
          <div
            key={friend.website}
            className="mt-4 box-border flex w-full max-w-full shrink-0 px-2 md:mt-6 md:w-1/3 md:px-3"
          >
            <div className="relative m-0 mb-7 flex min-w-0 flex-1 flex-col bg-canvas wrap-break-word shadow-card">
              <div className="relative block aspect-3/1 shrink-0 overflow-hidden">
                <div className="absolute inset-0 rounded-[inherit] border-0 bg-black/10 bg-cover bg-center bg-no-repeat">
                  <Image
                    src={friend.poster}
                    alt={friend.website}
                    width={1280}
                    height={425}
                    thumbhash={friend.posterThumbhash}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="block size-full object-cover"
                  />
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-center px-4 pt-3 pb-4">
                <div className="flex-1">
                  <div className="m-0 line-clamp-1 block leading-body font-semibold text-inherit">{friend.website}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-ink-3">
                    {friend.description ? friend.description : ' '}
                  </div>
                </div>
              </div>
              <a
                href={friend.homepage}
                target="_blank"
                rel="nofollow noreferrer"
                className="absolute inset-0 z-1 size-full"
                aria-label={`访问 ${friend.website}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
