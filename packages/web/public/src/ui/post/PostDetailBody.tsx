import type { ClientTag, CommentFormUser, DetailPostShell, DraftMarker } from '@kobato/catalog/model.ts'
import type { DetailPageComments } from '@kobato/contracts/comments.ts'
import type { MarkdownHeading } from '@kobato/inkling/headless/toc.ts'

import { useSiteIdentity } from '@kobato/web-client/settings/blog-settings-context.tsx'
import { LikeShare } from '@kobato/web-public/ui/LikeActions.tsx'
import { DetailBodyChrome } from '@kobato/web-public/ui/post/DetailBodyChrome.tsx'
import { postMetaTagsClass } from '@kobato/web-public/ui/post/postChrome.ts'
import { useCodeCopyButtons } from '@kobato/web-public/ui/post/use-code-copy-buttons.ts'
import { useFootnotePreviews } from '@kobato/web-public/ui/post/use-footnote-previews.ts'
import { useMediumZoom } from '@kobato/web-public/ui/post/use-medium-zoom.ts'
import { useMusicPlayers } from '@kobato/web-public/ui/post/use-music-players.tsx'
import { useThumbhashHydration } from '@kobato/web-public/ui/post/use-thumbhash-hydration.ts'
import { Sidebar, type SidebarData } from '@kobato/web-public/ui/Sidebar.tsx'
import { type ReactNode, useRef } from 'react'
import { Link } from 'react-router'

export interface PostDetailBodyProps {
  post: DetailPostShell
  headings: MarkdownHeading[]
  bodyHtml: string
  visibleTags: ClientTag[]
  mode: 'admin' | 'public'
  likes: number
  commentKey: string
  commentsPromise: Promise<DetailPageComments>
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
  useMediumZoom(postContentRef, bodyHtml)
  useThumbhashHydration(postContentRef, bodyHtml)
  useCodeCopyButtons(postContentRef, bodyHtml)
  useMusicPlayers(postContentRef, bodyHtml)
  useFootnotePreviews(postContentRef, bodyHtml)

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
                contentLanguage={post.contentLanguage}
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
