import { type ReactNode, useRef } from 'react'
import { Link } from 'react-router'

import type { ClientTag, CommentFormUser, DetailPostShell, MarkdownHeading } from '@/shared/types/catalog'
import type { DetailPageComments } from '@/shared/types/comments'
import type { DraftMarker } from '@/ui/public/post/DetailBodyChrome'

import { useMediumZoom } from '@/client/hooks/use-medium-zoom'
import { useSiteIdentity } from '@/ui/lib/blog-config-context'
import { LikeShare } from '@/ui/public/LikeActions'
import { DetailBodyChrome } from '@/ui/public/post/DetailBodyChrome'
import { postMetaTagsClass } from '@/ui/public/post/postChrome'
import { Sidebar, type SidebarData } from '@/ui/public/Sidebar'

export interface PostDetailBodyProps {
  post: DetailPostShell
  headings: MarkdownHeading[]
  visibleTags: ClientTag[]
  admin: boolean
  likes: number
  commentKey: string
  /** Streamed in via React Router `<Await>`. */
  commentsPromise: Promise<DetailPageComments>
  currentUser?: CommentFormUser
  draftMarker?: DraftMarker
  sidebar: SidebarData
  children: ReactNode
}

export function PostDetailBody({
  post,
  headings,
  visibleTags,
  admin,
  likes,
  commentKey,
  commentsPromise,
  currentUser,
  draftMarker,
  sidebar,
  children,
}: PostDetailBodyProps) {
  const config = useSiteIdentity()
  const postContentRef = useRef<HTMLDivElement>(null)
  useMediumZoom(postContentRef)

  return (
    <div className="py-4 md:py-6 lg:px-2 2xl:px-12 2xl:py-12">
      <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
        <div className="-mx-3 flex flex-wrap">
          <div className="box-border w-full max-w-full shrink-0 px-3 xl:w-[71%]">
            {/* Collapsed the historical two-layer DOM (outer
                `<div class="post flex flex-col …">` holding the card
                chrome, inner `<div class="flex-1 p-4 md:p-8">`
                holding the body padding) into a single wrapper since
                the bare `.post` class attaches no CSS rule. The
                inner wrapper's `flex-1` / `p-4 md:p-8` utilities
                migrated to the same element. */}
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
                currentUser={currentUser}
                commentsEnabled={post.comments}
                admin={admin}
                editHref={admin ? `/editor/post/${post.id}` : undefined}
                draftMarker={draftMarker}
                postContentRef={postContentRef}
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
              >
                {children}
              </DetailBodyChrome>
            </div>
          </div>
          <Sidebar data={sidebar} />
        </div>
      </div>
    </div>
  )
}
