import type { ReactNode } from 'react'

import { CheckIcon, ImageIcon, LinkIcon, ReplyIcon, SquarePenIcon, Trash2Icon, UserIcon, XIcon } from 'lucide-react'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentActions } from '@/ui/admin/comments/useCommentsController'

import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { avatarImageUrl } from '@/shared/utils/avatar'
import { formatLocalDate } from '@/shared/utils/formatter'
import { safeHref } from '@/shared/utils/safe-url'
import { idStr } from '@/shared/utils/tools'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Badge } from '@/ui/components/badge'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'
import { commentBodyPlainText } from '@/ui/public/comments/comment-body-helpers'
import { CommentContentHtml } from '@/ui/public/comments/CommentContentHtml'
import { Image } from '@/ui/public/widgets/Image'

const ADMIN_DATE_FORMAT = 'yyyy-LL-dd HH:mm'

/** tRich chunks renderer for the replied-to author name (module scope — stable). */
function renderReplyAuthor(chunks: ReactNode[]): ReactNode {
  return <span className="underline-offset-2 hover:underline">{chunks}</span>
}
const REPLY_SNIPPET_MAX = 60

export interface AdminCommentRowProps {
  comment: AdminComment
  parentLookup: Map<string, AdminComment>
  actions: CommentActions
}

export function AdminCommentRow({ comment, parentLookup, actions }: AdminCommentRowProps) {
  const { t, tRich } = useI18n()
  const config = useSiteIdentity()
  const authorHref = safeHref(comment.link)

  const initial = (comment.name || comment.email || '?').slice(0, 1).toUpperCase()

  const parent = resolveParent(comment, parentLookup)

  return (
    <div
      data-slot="admin-comment-row"
      className="group grid grid-cols-1 gap-4 px-4 py-3 transition-colors hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_var(--spacing-admin-thumb)]"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={avatarImageUrl(comment.userId)} alt={comment.name} />
          <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{initial}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          {/* Header: name + badges */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => actions.filterByAuthor(idStr(comment.userId), comment.name)}
              title={t('admin.comments.row.filterByAuthor', { name: comment.name })}
              className="cursor-pointer truncate text-left font-semibold hover:text-primary focus-visible:text-primary focus-visible:outline-none"
            >
              {comment.name}
            </button>
            {authorHref && (
              <a
                href={authorHref}
                target="_blank"
                rel="nofollow noreferrer"
                aria-label={t('admin.comments.row.visitSite', { name: comment.name })}
                className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
              >
                <LinkIcon />
              </a>
            )}
            {comment.badgeName && (
              <Badge
                style={{
                  backgroundColor: comment.badgeColor || '#007a82',
                  color: comment.badgeTextColor || '#ffffff',
                }}
                className="border-transparent"
              >
                {comment.badgeName}
              </Badge>
            )}
            {comment.deleteRequestedAt ? (
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                {t('admin.comments.row.deleteRequested')}
              </Badge>
            ) : comment.isPending ? (
              <Badge variant="secondary">{t('admin.comments.row.pending')}</Badge>
            ) : (
              <Badge variant="secondary">{t('admin.comments.row.approved')}</Badge>
            )}
          </div>

          {/* Meta: date + page */}
          <p className="mt-0.5 truncate text-admin-sm text-muted-foreground">
            {comment.createAt ? formatLocalDate(comment.createAt, ADMIN_DATE_FORMAT, config) : ''}
            {comment.pageTitle && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={() => actions.filterByPage(comment.pagePublicId ?? '', comment.pageTitle ?? '')}
                  title={t('admin.comments.row.filterByPage', { title: comment.pageTitle })}
                  className="hover:text-foreground"
                >
                  {comment.pageTitle}
                </button>
              </>
            )}
          </p>

          {/* "Replied to" hint — only when the parent is in the loaded list */}
          {parent && (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              <ReplyIcon className="mr-1 inline size-3 align-[-2px]" />
              {tRich('admin.comments.row.repliedTo', {
                name: parent.name,
                author: renderReplyAuthor,
              })}
              <span className="text-foreground/70"> “{snippet(parent.body, REPLY_SNIPPET_MAX)}”</span>
            </p>
          )}

          {/* Body — the saved feed-variant HTML projection, sanitized at render. */}
          <CommentContentHtml
            content={comment.content}
            className="comment-content typeset typeset-comment mt-2 leading-copy wrap-break-word whitespace-normal"
          />

          {/* Action row — flat, no overflow menu. Text label hides on narrow screens. */}
          <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
            {comment.isPending && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={actions.isApproving(comment)}
                onClick={() => actions.approve(comment)}
                aria-label={t('admin.comments.row.approveAria')}
              >
                <CheckIcon data-icon="sm" />
                <span className="hidden sm:inline">{t('admin.comments.row.approve')}</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => actions.reply(comment)}
              aria-label={t('admin.comments.row.reply')}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ReplyIcon data-icon="sm" />
              <span className="hidden sm:inline">{t('admin.comments.row.reply')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => actions.edit(comment)}
              aria-label={t('admin.comments.row.edit')}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <SquarePenIcon data-icon="sm" />
              <span className="hidden sm:inline">{t('admin.comments.row.edit')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => actions.editUser(comment)}
              aria-label={t('admin.comments.row.editUser')}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <UserIcon data-icon="sm" />
              <span className="hidden sm:inline">{t('admin.comments.row.editUser')}</span>
            </Button>
            {comment.pagePermalink && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                render={
                  <a
                    href={comment.pagePermalink}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('admin.comments.row.viewPage')}
                  />
                }
                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <LinkIcon data-icon="sm" />
                <span className="hidden sm:inline">{t('admin.comments.row.viewPage')}</span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={actions.isRemoving(comment)}
              onClick={() => actions.remove(comment)}
              aria-label={t('admin.comments.row.delete')}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon data-icon="sm" />
              <span className="hidden sm:inline">{t('admin.comments.row.delete')}</span>
            </Button>
            {comment.deleteRequestedAt && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={actions.isResolvingDeletion(comment)}
                  onClick={() => actions.rejectDeletion(comment)}
                  aria-label={t('admin.comments.row.rejectDeletionAria')}
                  className="h-7 px-2.5 text-xs"
                >
                  <XIcon data-icon="sm" />
                  <span className="hidden sm:inline">{t('admin.comments.row.rejectDeletion')}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={actions.isResolvingDeletion(comment)}
                  onClick={() => actions.approveDeletion(comment)}
                  aria-label={t('admin.comments.row.approveDeletionAria')}
                  className="h-7 px-2.5 text-xs"
                >
                  <CheckIcon data-icon="sm" />
                  <span className="hidden sm:inline">{t('admin.comments.row.approveDeletion')}</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Cover thumbnail */}
      {comment.pageCover ? (
        <div className="hidden aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 self-start overflow-hidden rounded-xl bg-muted md:block">
          <Image
            src={comment.pageCover}
            alt=""
            width={200}
            height={125}
            className="size-full object-cover"
            loading="lazy"
          />
        </div>
      ) : comment.pageTitle ? (
        <div className="hidden aspect-[16/10] w-(--spacing-admin-thumb) shrink-0 items-center justify-center self-start rounded-xl bg-muted text-muted-foreground md:flex">
          <ImageIcon className="size-5" />
        </div>
      ) : null}
    </div>
  )
}

function resolveParent(comment: AdminComment, parentLookup: Map<string, AdminComment>): AdminComment | null {
  if (comment.rootId) {
    const direct = parentLookup.get(comment.rootId)
    if (direct) {
      return direct
    }
  }
  if (comment.rid > 0) {
    for (const candidate of parentLookup.values()) {
      if (candidate.rid === comment.rid && candidate.id !== comment.id) {
        return candidate
      }
    }
  }
  return null
}

// Single-line body preview; the shared plain-text projection collapses breaks into whitespace.
function snippet(body: AdminComment['body'], max: number): string {
  const text = commentBodyPlainText(body).replace(/\s+/g, ' ').trim()
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}…`
}
