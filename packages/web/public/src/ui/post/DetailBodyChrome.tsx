import type { DetailPageComments } from '@kobato/api/contracts/comments'
import type { CommentFormUser, DraftMarker } from '@kobato/catalog/model'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { MarkdownHeading } from '@kobato/inkling/headless/toc'
import type { SiteIdentitySettings } from '@kobato/settings/types'

import { sanitizeHtml } from '@kobato/sanitize/sanitize-html'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { formatLocalDate } from '@kobato/utils/site-date'
import { Comments } from '@kobato/web-public/ui/comments/Comments'
import { CommentsSkeleton } from '@kobato/web-public/ui/comments/CommentsSkeleton'
import { LikeButton } from '@kobato/web-public/ui/LikeActions'
import { postMetaClass, postMetaDateClass, postTitleClass } from '@kobato/web-public/ui/post/postChrome'
import { TableOfContents } from '@kobato/web-public/ui/post/TableOfContents'
import { PencilIcon } from 'lucide-react'
import { type ReactNode, Suspense, useMemo } from 'react'
import { Await, Link } from 'react-router'

const DRAFT_MARKER_LABEL_IDS = {
  draft: { sr: 'public.posts.draftPrefix', visible: 'public.posts.draftBadge' },
  'unpublished-draft': {
    sr: 'public.posts.unpublishedDraftPrefix',
    visible: 'public.posts.unpublishedDraftBadge',
  },
  'published-draft': {
    sr: 'public.posts.publishedDraftPrefix',
    visible: 'public.posts.publishedDraftBadge',
  },
} as const satisfies Record<Exclude<DraftMarker, null>, { sr: UiMessageId; visible: UiMessageId }>

export interface DetailBodyChromeProps {
  siteIdentity: SiteIdentitySettings
  title: string
  date: Date
  updated?: Date | null
  showUpdated?: boolean
  headings: MarkdownHeading[]
  toc?: boolean
  likes: number
  permalink: string
  commentKey: string
  commentsPromise: Promise<DetailPageComments>
  currentUser?: CommentFormUser
  comments?: boolean
  webmentions?: ReactNode
  mode?: 'admin' | 'public'
  editHref?: string
  draftMarker?: DraftMarker
  metaExtra?: ReactNode
  afterLikeButton?: ReactNode
  bodyHtml: string
  contentLanguage?: string | null
  children?: ReactNode
  postContentRef: React.RefObject<HTMLDivElement | null>
  contentWrapperClassName?: string
  metaClassName?: string
}

export function DetailBodyChrome({
  siteIdentity,
  title,
  date,
  updated,
  showUpdated = false,
  headings,
  toc = false,
  likes,
  permalink,
  commentKey,
  commentsPromise,
  currentUser,
  comments = false,
  webmentions,
  mode,
  editHref,
  draftMarker = null,
  metaExtra,
  afterLikeButton,
  bodyHtml,
  contentLanguage,
  children,
  postContentRef,
  contentWrapperClassName,
  metaClassName,
}: DetailBodyChromeProps) {
  const { t } = useI18n()
  const markerLabel =
    draftMarker === null
      ? null
      : { sr: t(DRAFT_MARKER_LABEL_IDS[draftMarker].sr), visible: t(DRAFT_MARKER_LABEL_IDS[draftMarker].visible) }
  const publishedIso = date.toISOString()
  const updatedAt = updated ?? date
  const updatedIso = updatedAt.toISOString()
  const cleanBodyHtml = useMemo(() => sanitizeHtml(bodyHtml, 'body'), [bodyHtml])

  return (
    <>
      {mode === 'admin' && editHref && (
        <Link
          to={editHref}
          className="absolute top-4 right-4 inline-flex h-8 w-8 translate-y-0.5 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-surface-soft hover:text-ink-1 md:top-8 md:right-8 md:translate-y-1"
          aria-label={t('common.action.edit')}
          title={t('common.action.edit')}
          prefetch="intent"
        >
          <PencilIcon className="size-4" />
        </Link>
      )}
      <h1 className={cn(postTitleClass, 'font-bold text-balance', mode === 'admin' && editHref && 'pr-10')}>
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
              <span className="shrink-0">{t('public.posts.updatedAt')}</span>
              <time dateTime={updatedIso} className="tabular-nums">
                {formatLocalDate(updatedAt, 'yyyy-MM-dd HH:mm', siteIdentity)}
              </time>
            </div>
          )}
        </div>
        {metaExtra}
      </div>
      <TableOfContents headings={headings} toc={toc ? 'enabled' : 'disabled'} />
      <div className={contentWrapperClassName}>
        <div
          ref={postContentRef}
          className={cn('post-content', 'typeset typeset-post')}
          lang={contentLanguage ?? undefined}
          dir={contentLanguage === null || contentLanguage === undefined || contentLanguage === '' ? undefined : 'auto'}
          dangerouslySetInnerHTML={{ __html: cleanBodyHtml }}
        />
        {children}
      </div>
      <LikeButton permalink={permalink} commentKey={commentKey} likes={likes} />
      {afterLikeButton}
      {webmentions}
      {comments && (
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
