import { type ReactNode, useRef } from 'react'
import { Link } from 'react-router'

import type { ClientTag, CommentFormUser, DetailPostShell, DraftMarker } from '@/shared/types/catalog'
import type { DetailPageComments } from '@/shared/types/comments'
import type { MarkdownHeading } from '@/shared/utils/toc'

import { useMediumZoom } from '@/client/hooks/use-medium-zoom'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { LikeShare } from '@/ui/public/LikeActions'
import { DetailBodyChrome } from '@/ui/public/post/DetailBodyChrome'
import { postMetaTagsClass } from '@/ui/public/post/postChrome'
import { useCodeCopyButtons } from '@/ui/public/post/use-code-copy-buttons'
import { useFootnotePreviews } from '@/ui/public/post/use-footnote-previews'
import { useMusicPlayers } from '@/ui/public/post/use-music-players'
import { useThumbhashHydration } from '@/ui/public/post/use-thumbhash-hydration'
import { Sidebar, type SidebarData } from '@/ui/public/Sidebar'

export interface PostDetailBodyProps {
  post: DetailPostShell
  headings: MarkdownHeading[]
  /** Saved `body_html` projection from the loader. */
  bodyHtml: string
  visibleTags: ClientTag[]
  mode: 'admin' | 'public'
  likes: number
  commentKey: string
  /** Streamed in via React Router `<Await>`. */
  commentsPromise: Promise<DetailPageComments>
  /** 引用与回应 block node (route wraps the streamed list in `<Await>`). */
  webmentions?: ReactNode
  currentUser?: CommentFormUser
  draftMarker?: DraftMarker
  sidebar: SidebarData
}

export function PostDetailBody({
  post,
  headings,
  bodyHtml,
  visibleTags,
  mode,
  likes,
  commentKey,
  commentsPromise,
  webmentions,
  currentUser,
  draftMarker,
  sidebar,
}: PostDetailBodyProps) {
  const config = useSiteIdentity()
  const postContentRef = useRef<HTMLDivElement>(null)
  useMediumZoom(postContentRef)
  useThumbhashHydration(postContentRef)
  useCodeCopyButtons(postContentRef)
  useMusicPlayers(postContentRef)
  useFootnotePreviews(postContentRef)

  return (
    <div className="py-4 md:py-6 lg:px-2 2xl:px-12 2xl:py-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="-mx-3 flex flex-wrap">
          <div className="box-border w-full max-w-full min-w-0 shrink-0 px-3 xl:w-content-main">
            <div className="relative mb-5 flex min-w-0 flex-col bg-canvas p-4 wrap-break-word shadow-card md:p-8">
              <DetailBodyChrome
                siteIdentity={config}
                title={post.title}
                date={post.date}
                updated={post.updated}
                showUpdated={post.showUpdated}
                headings={headings}
                toc={post.toc}
                likes={likes}
                permalink={post.permalink}
                commentKey={commentKey}
                commentsPromise={commentsPromise}
                webmentions={webmentions}
                currentUser={currentUser}
                comments={post.comments}
                mode={mode}
                editHref={mode === 'admin' ? `/editor/post/${post.id}` : undefined}
                draftMarker={draftMarker}
                postContentRef={postContentRef}
                bodyHtml={bodyHtml}
                metaClassName="mt-4 mb-3"
                metaExtra={
                  visibleTags.length > 0 ? (
                    <div className={postMetaTagsClass}>
                      {visibleTags.map((tag) => (
                        <Link
                          key={tag.slug}
                          className="rounded-full bg-surface-soft px-3 py-1.5 align-middle text-badge leading-badge font-normal whitespace-nowrap text-ink-3"
                          to={`/tags/${tag.slug}`}
                          prefetch="intent"
                        >
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  ) : null
                }
                afterLikeButton={<LikeShare post={post} />}
              />
            </div>
          </div>
          <Sidebar data={sidebar} />
        </div>
      </div>
    </div>
  )
}
