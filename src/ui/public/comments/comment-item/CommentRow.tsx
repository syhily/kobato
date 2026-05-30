import { XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { PortableTextBody } from '@/ui/pt/render'
import { CommentActions } from '@/ui/public/comments/comment-item/CommentActions'
import { CommentAuthorLine, CommentAvatar } from '@/ui/public/comments/comment-item/CommentAuthorLine'
import {
  asKey,
  commentBodyClass,
  commentContentClass,
  commentInnerClass,
  editableHint,
  nestedCommentInnerClass,
  nestedCommentLiClass,
  rootCommentLiClass,
  useCommentsLeafContext,
} from '@/ui/public/comments/comment-item/helpers'
import { InlineEditForm } from '@/ui/public/comments/comment-item/InlineEditForm'
import { InlineOwnEditForm } from '@/ui/public/comments/comment-item/InlineOwnEditForm'

interface CommentRowProps {
  comment: CommentItemType
  depth: number
  pending?: boolean
  mode?: 'admin' | 'public'
  children?: ReactNode
}

export function CommentRow({ comment, depth, pending, mode: propMode, children }: CommentRowProps) {
  // `editing` is a small state machine — only one kind of editor can be
  // open at a time. `admin` opens the admin/legacy-token-backed
  // `<InlineEditForm>` (which round-trips through `comment.getRaw` /
  // `comment.edit`); `own` opens the visitor-scoped `<InlineOwnEditForm>`
  // (which posts to `comment.updateOwn` with the body the SSR already
  // shipped, no extra fetch). The footer picks the discriminator based
  // on which button the operator clicks.
  const [editing, setEditing] = useState<'admin' | 'own' | false>(false)
  const leaf = useCommentsLeafContext(propMode)
  const isMyComment = leaf.myCommentIds.has(asKey(comment.id))
  const isOwnedByCurrentUser = leaf.currentUserId !== null && String(comment.userId) === leaf.currentUserId
  const hasPendingDelete = comment.deleteRequestedAt !== null && comment.deleteRequestedAt !== undefined
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
          {isMyComment && (
            <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
              <span className="flex-1">{editableHint(leaf.myCommentExpiresAt.get(asKey(comment.id)), isPending)}</span>
              <button
                type="button"
                onClick={() => leaf.onDismissMyComment(comment.id)}
                className="inline-flex shrink-0 items-center justify-center rounded-sm p-0.5 hover:bg-status-warn-border"
                aria-label="关闭提示"
                title="关闭提示并移除编辑权限"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
          {isOwnedByCurrentUser && hasPendingDelete && (
            <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
              <span className="flex-1">你已申请删除这条评论，等待管理员处理。</span>
            </div>
          )}
          {isPending && !isMyComment && (
            <div className={commentContentClass(depth)}>
              <div className="mt-1.5 mb-1.5 flex w-full items-center gap-1.5 rounded-md border border-status-warn-border/30 bg-status-warn-bg px-2.5 py-1 text-xs text-status-warn-fg">
                <span>您的评论正在等待审核中...</span>
              </div>
              <PortableTextBody body={comment.body} />
            </div>
          )}
          {(!isPending || isMyComment) && (
            <div className={commentContentClass(depth)}>
              <PortableTextBody body={comment.body} />
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
            mode={propMode}
            onEditAdmin={() => setEditing('admin')}
            onEditOwn={() => setEditing('own')}
          />
        </div>
      </article>
      {children}
    </li>
  )
}
