import type { CommentItemWire as CommentItemType } from '@kobato/api/contracts/comments'

import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import {
  getCommentFlashServerSnapshot,
  getCommentFlashSnapshot,
  subscribeCommentFlash,
} from '@kobato/web-client/lib/comment-flash'
import { commentFlags } from '@kobato/web-public/ui/comments/comment-item/comment-flags'
import { CommentActions } from '@kobato/web-public/ui/comments/comment-item/CommentActions'
import { CommentAuthorLine, CommentAvatar } from '@kobato/web-public/ui/comments/comment-item/CommentAuthorLine'
import { InlineEditForm } from '@kobato/web-public/ui/comments/comment-item/InlineEditForm'
import { InlineOwnEditForm } from '@kobato/web-public/ui/comments/comment-item/InlineOwnEditForm'
import {
  commentBodyClass,
  commentContentClass,
  commentInnerClass,
  editableHint,
  nestedCommentInnerClass,
  nestedCommentLiClass,
  rootCommentLiClass,
} from '@kobato/web-public/ui/comments/comment-item/presentation'
import { CommentContentHtml } from '@kobato/web-public/ui/comments/CommentContentHtml'
import { useCommentsActions, useCommentsIdentity } from '@kobato/web-public/ui/comments/comments-context'
import { XIcon } from 'lucide-react'
import { useState, type ReactNode, useSyncExternalStore } from 'react'

interface CommentRowProps {
  comment: CommentItemType
  depth: number
  pending?: boolean
  children?: ReactNode
}

export function CommentRow({ comment, depth, pending, children }: CommentRowProps) {
  const { locale, t } = useI18n()
  const [editing, setEditing] = useState<'admin' | 'own' | false>(false)
  const identity = useCommentsIdentity('CommentRow')
  const actions = useCommentsActions('CommentRow')
  const flags = commentFlags(comment, identity)
  const isPending = pending ?? comment.isPending ?? false
  const flashedId = useSyncExternalStore(subscribeCommentFlash, getCommentFlashSnapshot, getCommentFlashServerSnapshot)
  const isFlashed = flashedId !== null && flashedId === comment.id
  return (
    <li
      id={`user-comment-${comment.id}`}
      className={depth === 1 ? rootCommentLiClass() : nestedCommentLiClass()}
      data-depth={depth}
    >
      <article id={`div-comment-${comment.id}`} className={cn(commentBodyClass, isFlashed && 'active')}>
        <CommentAvatar comment={comment} depth={depth} />
        <div className={depth === 1 ? commentInnerClass : nestedCommentInnerClass()}>
          <CommentAuthorLine comment={comment} />
          {flags.isMine && (
            <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
              <span className="flex-1">{editableHint(flags.myExpiresAt, isPending, t, locale)}</span>
              <button
                type="button"
                onClick={() => actions.onDismissMyComment(comment.id)}
                className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 hover:bg-status-warn-border"
                aria-label={t('public.comments.dismissNotice')}
                title={t('public.comments.dismissAndRevoke')}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
          {flags.isOwnedByCurrentUser && flags.hasPendingDelete && (
            <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
              <span className="flex-1">{t('public.comments.pendingDelete')}</span>
            </div>
          )}
          {isPending && !flags.isMine && (
            <div className={commentContentClass(depth)}>
              <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
                <span>{t('public.comments.awaitingModeration')}</span>
              </div>
              <CommentContentHtml content={comment.content} />
            </div>
          )}
          {(!isPending || flags.isMine) && (
            <CommentContentHtml content={comment.content} className={commentContentClass(depth)} />
          )}
          {editing === 'admin' && (
            <InlineEditForm comment={comment} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
          )}
          {editing === 'own' && (
            <InlineOwnEditForm comment={comment} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
          )}
          <CommentActions
            comment={comment}
            onEditAdmin={() => setEditing('admin')}
            onEditOwn={() => setEditing('own')}
          />
        </div>
      </article>
      {children}
    </li>
  )
}
