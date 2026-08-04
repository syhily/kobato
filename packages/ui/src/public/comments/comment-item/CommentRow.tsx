import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'

import { LexicalCommentBody } from '@kobato/editor/lexical-html/LexicalCommentBody'
import { commentFlags } from '@kobato/ui/public/comments/comment-item/comment-flags'
import { CommentActions } from '@kobato/ui/public/comments/comment-item/CommentActions'
import { CommentAuthorLine, CommentAvatar } from '@kobato/ui/public/comments/comment-item/CommentAuthorLine'
import {
  commentBodyClass,
  commentContentClass,
  commentInnerClass,
  editableHint,
  nestedCommentInnerClass,
  nestedCommentLiClass,
  rootCommentLiClass,
} from '@kobato/ui/public/comments/comment-item/helpers'
import { InlineEditForm } from '@kobato/ui/public/comments/comment-item/InlineEditForm'
import { InlineOwnEditForm } from '@kobato/ui/public/comments/comment-item/InlineOwnEditForm'
import { useCommentsActions, useCommentsIdentity } from '@kobato/ui/public/comments/comments-context'
import { XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface CommentRowProps {
  comment: CommentItemType
  depth: number
  pending?: boolean
  children?: ReactNode
}

export function CommentRow({ comment, depth, pending, children }: CommentRowProps) {
  const [editing, setEditing] = useState<'admin' | 'own' | false>(false)
  const identity = useCommentsIdentity('CommentRow')
  const actions = useCommentsActions('CommentRow')
  const flags = commentFlags(comment, identity)
  const isPending = pending ?? comment.isPending ?? false
  return (
    <li
      id={`user-comment-${comment.id}`}
      className={depth === 1 ? rootCommentLiClass() : nestedCommentLiClass()}
      data-depth={depth}
    >
      <article id={`div-comment-${comment.id}`} className={commentBodyClass}>
        <CommentAvatar comment={comment} depth={depth} />
        <div className={depth === 1 ? commentInnerClass : nestedCommentInnerClass()}>
          <CommentAuthorLine comment={comment} />
          {flags.isMine && (
            <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
              <span className="flex-1">{editableHint(flags.myExpiresAt, isPending)}</span>
              <button
                type="button"
                onClick={() => actions.onDismissMyComment(comment.id)}
                className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 hover:bg-status-warn-border"
                aria-label="关闭提示"
                title="关闭提示并移除编辑权限"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
          {flags.isOwnedByCurrentUser && flags.hasPendingDelete && (
            <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
              <span className="flex-1">你已申请删除这条评论，等待管理员处理。</span>
            </div>
          )}
          {isPending && !flags.isMine && (
            <div className={commentContentClass(depth)}>
              <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
                <span>您的评论正在等待审核中...</span>
              </div>
              <LexicalCommentBody body={comment.body} />
            </div>
          )}
          {(!isPending || flags.isMine) && (
            <div className={commentContentClass(depth)}>
              <LexicalCommentBody body={comment.body} />
            </div>
          )}
          {editing === 'admin' && (
            <InlineEditForm
              commentId={comment.id}
              onCancel={() => setEditing(false)}
              onSaved={() => setEditing(false)}
            />
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
