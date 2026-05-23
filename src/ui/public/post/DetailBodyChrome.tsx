import { PencilIcon } from 'lucide-react'
import { type ReactNode, Suspense } from 'react'
import { Await, Link } from 'react-router'

import type { SiteIdentitySettings } from '@/shared/config/blog'
import type { CommentFormUser, MarkdownHeading } from '@/shared/types/catalog'
import type { DetailPageComments } from '@/shared/types/comments'

import { formatLocalDate } from '@/shared/utils/formatter'
import { cn } from '@/ui/lib/cn'
import { Comments } from '@/ui/public/comments/Comments'
import { CommentsSkeleton } from '@/ui/public/comments/CommentsSkeleton'
import { LikeButton } from '@/ui/public/LikeActions'
import { postMetaClass, postMetaDateClass, postTitleClass } from '@/ui/public/post/postChrome'
import { TableOfContents } from '@/ui/public/post/TableOfContents'

export type DraftMarker = 'draft' | 'unpublished-draft' | 'published-draft' | null

const DRAFT_MARKER_LABELS: Record<Exclude<DraftMarker, null>, { sr: string; visible: string }> = {
  draft: { sr: '未发布草稿：', visible: '【草稿】' },
  'unpublished-draft': { sr: '未发布的草稿：', visible: '【未发布的草稿】' },
  'published-draft': { sr: '已发布的草稿：', visible: '【已发布的草稿】' },
}

export interface DetailBodyChromeProps {
  siteIdentity: SiteIdentitySettings
  title: string
  date: Date
  updated?: Date | null
  showUpdated: boolean
  headings: MarkdownHeading[]
  toc: boolean
  likes: number
  permalink: string
  commentKey: string
  commentsPromise: Promise<DetailPageComments>
  currentUser?: CommentFormUser
  commentsEnabled: boolean
  mode?: 'admin' | 'public'
  editHref?: string
  draftMarker?: DraftMarker
  metaExtra?: ReactNode
  afterLikeButton?: ReactNode
  children: ReactNode
  postContentRef: React.RefObject<HTMLDivElement | null>
  contentWrapperClassName?: string
  metaClassName?: string
}

export function DetailBodyChrome({
  siteIdentity,
  title,
  date,
  updated,
  showUpdated,
  headings,
  toc,
  likes,
  permalink,
  commentKey,
  commentsPromise,
  currentUser,
  commentsEnabled,
  mode,
  editHref,
  draftMarker = null,
  metaExtra,
  afterLikeButton,
  children,
  postContentRef,
  contentWrapperClassName,
  metaClassName,
}: DetailBodyChromeProps) {
  const markerLabel = draftMarker !== null ? DRAFT_MARKER_LABELS[draftMarker] : null
  const publishedIso = date.toISOString()
  const updatedAt = updated ?? date
  const updatedIso = updatedAt.toISOString()

  return (
    <>
      {mode === 'admin' && editHref && (
        <Link
          to={editHref}
          // The parent card uses `p-4 md:p-8`, so anchoring the icon
          // at `top-4/right-4` (and `top-8/right-8` on md+) makes the
          // button's top edge meet the title's top edge — i.e. on the
          // same horizontal line — while staying flush with the
          // title's right edge instead of poking into the card's
          // outer padding. Translate-y nudges the button down so its
          // vertical center sits closer to the title's optical
          // baseline (the h1's line-height is ~1.6× of `text-[1.5rem]`,
          // and the button is 8/8 — half the line height minus half
          // the button is roughly +2px / +6px at each breakpoint).
          className="absolute top-4 right-4 inline-flex h-8 w-8 translate-y-0.5 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-surface-soft hover:text-ink-1 md:top-8 md:right-8 md:translate-y-1"
          aria-label="编辑"
          title="编辑"
          prefetch="intent"
        >
          <PencilIcon className="size-4" />
        </Link>
      )}
      <h1 className={cn(postTitleClass, 'font-bold', mode === 'admin' && editHref && 'pr-10')}>
        {markerLabel !== null && (
          <span className="text-alert">
            <span className="sr-only">{markerLabel.sr}</span>
            {markerLabel.visible}
          </span>
        )}
        {title}
      </h1>
      <div className={cn(postMetaClass, 'text-sm text-ink-4', metaClassName)}>
        <div className={cn(postMetaDateClass, 'flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1')}>
          <time dateTime={publishedIso} className="tabular-nums">
            {formatLocalDate(date, 'yyyy-MM-dd HH:mm', siteIdentity)}
          </time>
          {showUpdated && (
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
              <span className="shrink-0">修改于</span>
              <time dateTime={updatedIso} className="tabular-nums">
                {formatLocalDate(updatedAt, 'yyyy-MM-dd HH:mm', siteIdentity)}
              </time>
            </div>
          )}
        </div>
        {metaExtra}
      </div>
      <TableOfContents headings={headings} toc={toc} />
      <div className={contentWrapperClassName}>
        {/* `post-content` is the compound suffix targeted by
            `@utility prose-blog { &.post-content {…} }` in
            `tailwind.css` for code-block / shiki / inline-code
            typography fine-tuning on rendered MDX bodies. */}
        <div ref={postContentRef} className={cn('post-content', 'prose-blog prose prose-lg max-w-none')}>
          {children}
        </div>
      </div>
      <LikeButton permalink={permalink} commentKey={commentKey} likes={likes} />
      {afterLikeButton}
      {commentsEnabled && (
        <Suspense fallback={<CommentsSkeleton />}>
          <Await resolve={commentsPromise}>
            {(resolved) => (
              <Comments
                commentKey={commentKey}
                comments={resolved.commentData}
                items={resolved.commentItems}
                user={currentUser}
              />
            )}
          </Await>
        </Suspense>
      )}
    </>
  )
}
