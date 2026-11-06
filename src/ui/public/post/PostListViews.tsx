import type { ReactNode } from 'react'

import { EyeIcon, HeartIcon, MessageCircleMoreIcon, PenLineIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { ListingPostCard, ListingPostCardWithMetadata } from '@/shared/types/catalog'

import { useSidebarSettings, useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatShowDate } from '@/shared/utils/formatter'
import { Button } from '@/ui/components/button'
import { cn } from '@/ui/lib/cn'
import { Pagination } from '@/ui/public/post/Pagination'
import { postTitleClass } from '@/ui/public/post/postChrome'
import { Sidebar, type SidebarData } from '@/ui/public/Sidebar'
import { Image } from '@/ui/public/widgets/Image'

export interface HomeLayoutBodyProps {
  resolvedPosts: ListingPostCardWithMetadata[]
  pageNum: number
  totalPage: number
  categoryLinks: Record<string, string>
  featurePosts: ListingPostCard[]
  sidebar: SidebarData
  /** From `loaderData.listingNowIso` — stabilises relative dates across SSR + hydration. */
  listingNowIso: string
  children?: ReactNode
  currentUser?: { role: string } | null
}

export function HomeLayoutBody({
  resolvedPosts,
  pageNum,
  totalPage,
  categoryLinks,
  featurePosts,
  sidebar,
  listingNowIso,
  children,
  currentUser,
}: HomeLayoutBodyProps) {
  const { sidebar: sidebarSettings } = useSidebarSettings()
  const hasSidebar = sidebarSettings.widgets.some((w) => w.enabled)

  return (
    <div className="pt-4 pb-0 md:pt-6 md:pb-0 lg:px-2 2xl:px-12 2xl:pt-12 2xl:pb-0">
      {pageNum === 1 && <FeaturePosts posts={featurePosts} />}
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="-mx-3 flex flex-wrap">
          {resolvedPosts.length === 0 ? (
            <EmptyHomeState currentUser={currentUser} hasSidebar={hasSidebar} />
          ) : (
            <PostCards
              pageNum={pageNum}
              posts={resolvedPosts}
              totalPage={totalPage}
              categoryLinks={categoryLinks}
              listingNowIso={listingNowIso}
              layout={hasSidebar ? 'with-sidebar' : 'full'}
            />
          )}
          <Sidebar data={sidebar} />
        </div>
      </div>
      {children}
    </div>
  )
}

function EmptyHomeState({ currentUser, hasSidebar }: { currentUser?: { role: string } | null; hasSidebar: boolean }) {
  const canWrite = currentUser?.role === 'admin' || currentUser?.role === 'author'
  return (
    <div
      className={cn(
        'box-border w-full max-w-full min-w-0 shrink-0 px-3',
        hasSidebar ? 'xl:w-content-main' : 'xl:w-full',
      )}
    >
      <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
        <div className="my-auto">
          <div className="mb-2 inline-flex size-16 items-center justify-center rounded-full bg-brand/10 text-brand">
            <PenLineIcon className="size-8" aria-hidden />
          </div>
          <div className="mb-6 text-ink-4">
            <div className="mb-1 text-lg font-medium text-ink-1">还没有文章</div>
            <div className="text-sm">
              {canWrite ? '去写第一篇文章，开始你的博客之旅吧' : '博客正在建设中，敬请期待'}
            </div>
          </div>
          {canWrite && <Button render={<Link to="/editor/post/new" prefetch="intent" />}>新建文章</Button>}
        </div>
      </div>
    </div>
  )
}

export interface PostListingBodyProps {
  title: string
  description?: string
  resolvedPosts: ListingPostCardWithMetadata[]
  pageNum: number
  totalPage: number
  rootPath: string
  pagination?: 'always' | 'auto'
  listingNowIso: string
}

export function PostListingBody({
  title,
  description,
  resolvedPosts,
  pageNum,
  totalPage,
  rootPath,
  pagination = 'always',
  listingNowIso,
}: PostListingBodyProps) {
  return (
    <div className="py-4 md:py-6 lg:px-2 2xl:px-12 2xl:py-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="mb-4 lg:mb-6">
          <h1 className={cn(postTitleClass, 'font-bold')}>{title}</h1>
          {description && (
            <div className="mt-1 text-ink-4">
              <span>{description}</span>
            </div>
          )}
        </div>
        {resolvedPosts.length === 0 ? (
          <div className="flex h-(--size-empty-state) flex-auto flex-col text-center">
            <div className="my-auto">
              <h1 className="font-number text-empty-state-hero">404</h1>
              <div>抱歉，没有你要找的内容...</div>
            </div>
          </div>
        ) : (
          <>
            <div className="-mx-1 -mt-2 flex flex-wrap md:-mx-2 md:-mt-4 2xl:-mx-3 2xl:-mt-6">
              {resolvedPosts.map((post, index) => (
                <PostSquare key={post.slug} post={post} first={index === 0} listingNowIso={listingNowIso} />
              ))}
            </div>
            {(pagination === 'always' || totalPage > 1) && (
              <div className="mt-6 lg:mt-12">
                <Pagination current={pageNum} total={totalPage} rootPath={rootPath} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface FeaturePostsProps {
  posts: ListingPostCard[]
}

function FeaturePosts({ posts }: FeaturePostsProps) {
  if (posts.length !== 3) {
    return null
  }
  return (
    <div className="list-top-pushes mb-4 2xl:mb-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="-mx-1 -mt-2 flex flex-wrap md:-mx-2 lg:mt-0">
          <div className="mt-2 box-border flex w-full max-w-full shrink-0 px-1 md:px-2 lg:mt-0 lg:w-2/3">
            <FeaturePost post={posts[0]} first />
          </div>
          <div className="mt-2 box-border flex w-full max-w-full shrink-0 flex-col px-1 md:mt-4 md:px-2 lg:mt-0 lg:w-1/3">
            <div className="-mx-1 -mt-2 flex flex-wrap md:-mx-2 md:-mt-4">
              <div className="mt-2 box-border w-1/2 max-w-full shrink-0 px-1 md:mt-4 md:px-2 lg:w-full">
                <FeaturePost post={posts[1]} />
              </div>
              <div className="mt-2 box-border w-1/2 max-w-full shrink-0 px-1 md:mt-4 md:px-2 lg:w-full">
                <FeaturePost post={posts[2]} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeaturePost({ post, first = false }: { post: ListingPostCard; first?: boolean }) {
  return (
    <div className="relative mb-0 flex min-w-0 flex-1 flex-col wrap-break-word">
      <div className="relative block aspect-3/2 flex-1 shrink-0 overflow-hidden">
        <Link
          to={post.permalink}
          className="group absolute inset-0 rounded-[inherit] border-0 bg-black/10 bg-cover bg-center bg-no-repeat"
          prefetch="intent"
        >
          <Image
            src={post.cover}
            alt={post.title}
            width={first ? 750 : 450}
            height={first ? 500 : 300}
            thumbhash={post.coverThumbhash}
            sizes={first ? '(max-width: 1024px) 100vw, 67vw' : '(max-width: 1024px) 50vw, 33vw'}
            className="block size-full object-cover"
          />
          <div className="absolute inset-0 size-full bg-surface-secondary/60 opacity-60 transition-opacity duration-300 ease-in-out group-hover:opacity-[0.22]" />
        </Link>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-1 flex flex-none flex-col p-2 md:p-4">
        <div className="flex flex-none flex-col">
          <Link
            to={post.permalink}
            className="m-0 mb-2 line-clamp-2 block text-base leading-body font-semibold text-ink-on-dark hover:text-ink-on-dark hover:[text-shadow:var(--brand)_1px_0_4px] md:text-xl"
            prefetch="intent"
          >
            {post.title}
          </Link>
        </div>
      </div>
    </div>
  )
}

export interface PostCardsProps {
  posts: ListingPostCardWithMetadata[]
  pageNum: number
  totalPage: number
  categoryLinks: Record<string, string>
  listingNowIso: string
  layout?: 'with-sidebar' | 'full'
}

export function PostCards({
  pageNum,
  posts,
  totalPage,
  categoryLinks,
  listingNowIso,
  layout = 'with-sidebar',
}: PostCardsProps) {
  const config = useSiteIdentity()
  return (
    <div
      className={cn(
        'box-border w-full max-w-full min-w-0 shrink-0 px-3',
        layout === 'with-sidebar' ? 'xl:w-content-main' : 'xl:w-full',
      )}
    >
      <div>
        {posts.map((post) => (
          <div
            key={post.slug}
            className="relative m-0 mb-6 flex min-w-0 flex-1 flex-row bg-canvas wrap-break-word shadow-card md:mb-4"
          >
            <div className="relative block aspect-3/2 w-1/2 shrink-0 overflow-hidden md:w-5/12">
              <Link
                to={post.permalink}
                className="absolute inset-0 rounded-[inherit] border-0 bg-black/10 bg-cover bg-center bg-no-repeat"
                prefetch="intent"
              >
                <Image
                  src={post.cover}
                  alt={post.title}
                  width={600}
                  height={400}
                  thumbhash={post.coverThumbhash}
                  sizes="(max-width: 768px) 50vw, 42vw"
                  className="block size-full object-cover"
                />
              </Link>
              <div className="absolute inset-x-0 top-0 z-2 flex items-center text-ink-on-dark">
                <Link
                  className="hidden rounded-none bg-surface-secondary/60 px-2.5 py-badge-overlay-y align-middle text-badge font-normal md:inline-block"
                  to={categoryLinks[post.category] || '/'}
                  prefetch="intent"
                >
                  {post.category}
                </Link>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center bg-canvas p-3 md:px-5 md:pt-5 md:pb-4 lg:p-6">
              <div className="flex-1">
                <Link
                  to={post.permalink}
                  className="m-0 block text-base leading-body font-semibold text-inherit hover:text-brand md:text-xl"
                  prefetch="intent"
                >
                  <div className="line-clamp-2">
                    {!post.published && (
                      <span className="text-alert">
                        <span className="sr-only">未发布草稿：</span>
                        【草稿】
                      </span>
                    )}
                    {post.title}
                  </div>
                </Link>
                <div className="mt-4 hidden text-md text-ink-3 md:block">
                  <div className="line-clamp-3">{post.summary ?? ''}</div>
                </div>
              </div>
              <div>
                <div className="flex flex-1 items-center text-sm text-ink-4">
                  <div className="hidden flex-1 md:block">{formatShowDate(post.date, config, listingNowIso)}</div>
                  <Metric className="text-ink-1" value={post.meta.views}>
                    <EyeIcon className="text-md" size="1em" aria-hidden />
                  </Metric>
                  <Metric className="text-ink-1" value={post.meta.likes}>
                    <HeartIcon className="text-md" fill="currentColor" strokeWidth={0} size="1em" aria-hidden />
                  </Metric>
                  <Metric className="text-ink-1" value={post.meta.comments}>
                    <MessageCircleMoreIcon className="text-md" size="1em" aria-hidden />
                  </Metric>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mb-6 md:mb-4">
        <Pagination current={pageNum} total={totalPage} rootPath="/" />
      </div>
    </div>
  )
}

const likeCountClass = 'leading-none'

function Metric({ children, value, className }: { children: ReactNode; value: number; className?: string }) {
  return (
    <div className={cn('ml-2.5 inline-flex items-center gap-1.5 align-middle', className)}>
      {children}
      <span className={likeCountClass}>{value}</span>
    </div>
  )
}

export interface PostSquareProps {
  post: ListingPostCardWithMetadata
  first: boolean
  listingNowIso: string
}

export function PostSquare({ post, first, listingNowIso }: PostSquareProps) {
  const config = useSiteIdentity()
  return (
    <div
      className={cn(
        'mt-2 box-border flex max-w-full shrink-0 px-1 md:mt-4 md:px-2 2xl:mt-6 2xl:px-3',
        first ? 'w-full md:w-2/3 xl:w-1/2' : 'w-1/2 md:w-1/3 xl:w-1/4',
      )}
    >
      <div className="relative mb-0 flex min-w-0 flex-1 flex-col wrap-break-word">
        <div className={cn('relative block flex-1 shrink-0 overflow-hidden', first ? 'aspect-36/17' : 'aspect-square')}>
          <Link
            to={post.permalink}
            className="group absolute inset-0 rounded-[inherit] border-0 bg-black/10 bg-cover bg-center bg-no-repeat"
            prefetch="intent"
          >
            <Image
              src={post.cover}
              alt={post.title}
              width={first ? 600 : 300}
              height={300}
              thumbhash={post.coverThumbhash}
              sizes={
                first
                  ? '(max-width: 768px) 100vw, (max-width: 1280px) 67vw, 50vw'
                  : '(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw'
              }
              className="block size-full object-cover"
            />
            <div className="absolute inset-0 size-full bg-surface-secondary/60 opacity-60 transition-opacity duration-300 ease-in-out group-hover:opacity-[0.22]" />
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-1 flex flex-none flex-col p-2 md:px-4 md:py-3">
          <Link to={post.permalink} className="flex flex-none flex-col" prefetch="intent">
            <div className="m-0 mb-2 line-clamp-2 block leading-body font-semibold text-ink-on-dark hover:text-ink-on-dark hover:[text-shadow:var(--brand)_1px_0_4px]">
              {post.title}
            </div>
            <div className="font-number flex flex-1 text-sm text-ink-on-dark">
              <span className="inline-block">{formatShowDate(post.date, config, listingNowIso)}</span>
              <div className="flex-1" />
              <Metric value={post.meta.views}>
                <EyeIcon className="text-md" size="1em" aria-hidden />
              </Metric>
              <Metric value={post.meta.likes}>
                <HeartIcon className="text-md" fill="currentColor" strokeWidth={0} size="1em" aria-hidden />
              </Metric>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
