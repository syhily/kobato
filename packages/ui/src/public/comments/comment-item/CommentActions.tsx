import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { useSiteIdentity } from '@kobato/shared/lib/blog-config-context'
import { formatLocalDate } from '@kobato/shared/utils/formatter'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kobato/ui/components/alert-dialog'
import { cn } from '@kobato/ui/lib/cn'
import { commentFlags } from '@kobato/ui/public/comments/comment-item/comment-flags'
import { commentFooterButtonClass } from '@kobato/ui/public/comments/comment-item/helpers'
import { useCommentsActions, useCommentsIdentity } from '@kobato/ui/public/comments/comments-context'
import { useMutation } from '@tanstack/react-query'

interface CommentActionsProps {
  comment: CommentItemType
  /** Open the admin edit area (round-trips through `comment.edit`). */
  onEditAdmin: () => void
  /** Open the visitor self-edit area (posts to `comment.updateOwn`). */
  onEditOwn: () => void
}

export function CommentActions({ comment, onEditAdmin, onEditOwn }: CommentActionsProps) {
  const siteIdentity = useSiteIdentity()
  const identity = useCommentsIdentity('CommentActions')
  const actions = useCommentsActions('CommentActions')
  const approve = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: () => actions.onApproved(comment.id),
  })
  const remove = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: () => actions.onDeleted(comment.id),
  })

  // Own-comment mutations return the updated wire comment; route it through the
  // same reducer action as every other mutation instead of revalidating the detail loader.
  const requestDelete = useMutation({
    ...orpcQuery.comments.requestDeleteOwn.mutationOptions(),
    onSuccess: (payload) => actions.onEdited(payload.comment),
  })
  const cancelDelete = useMutation({
    ...orpcQuery.comments.cancelDeleteOwn.mutationOptions(),
    onSuccess: (payload) => actions.onEdited(payload.comment),
  })

  const flags = commentFlags(comment, identity)
  const showOwnAffordances = flags.isOwnedByCurrentUser && !identity.admin
  const ownEditDisabled = flags.hasPendingDelete || requestDelete.isPending || cancelDelete.isPending
  const deleteToggleDisabled = requestDelete.isPending || cancelDelete.isPending

  const handleReply = () => actions.onReply(Number(comment.id))
  const handleApprove = () => approve.mutate({ commentId: String(comment.id) })
  const handleDelete = () => remove.mutate({ commentId: String(comment.id) })
  const handleRequestDelete = () => requestDelete.mutate({ commentId: String(comment.id) })
  const handleCancelDelete = () => cancelDelete.mutate({ commentId: String(comment.id) })

  return (
    <div className="flex flex-1 items-center gap-2 text-xs text-ink-4">
      <time>{formatLocalDate(comment.createAt, 'yyyy-MM-dd HH:mm', siteIdentity)}</time>
      <button
        type="button"
        className={cn(commentFooterButtonClass, 'hover:text-brand')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleReply}
      >
        回复
      </button>
      {(identity.admin || flags.isMine) && (
        <button
          type="button"
          className={cn(commentFooterButtonClass, 'hover:text-alert')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onEditAdmin}
        >
          编辑
        </button>
      )}
      {showOwnAffordances && !flags.hasPendingDelete && (
        <button
          type="button"
          className={cn(commentFooterButtonClass, 'hover:text-alert')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onEditOwn}
          disabled={ownEditDisabled}
        >
          修改
        </button>
      )}
      {showOwnAffordances &&
        (flags.hasPendingDelete ? (
          <button
            type="button"
            className={cn(commentFooterButtonClass, 'hover:text-brand')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleCancelDelete}
            disabled={deleteToggleDisabled}
          >
            撤回删除
          </button>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  type="button"
                  className={cn(commentFooterButtonClass, 'hover:text-alert')}
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={deleteToggleDisabled}
                >
                  申请删除
                </button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>申请删除评论？</AlertDialogTitle>
                <AlertDialogDescription>
                  提交删除申请后，管理员将收到通知并进行审核。此操作不可撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleRequestDelete}>确认申请</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ))}
      {identity.admin && (
        <>
          {comment.isPending && (
            <button
              type="button"
              className={cn(commentFooterButtonClass, 'text-warn')}
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleApprove}
              disabled={approve.isPending}
            >
              通过
            </button>
          )}
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <button
                  type="button"
                  className={cn(commentFooterButtonClass, 'text-alert')}
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={remove.isPending}
                >
                  删除
                </button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除评论？</AlertDialogTitle>
                <AlertDialogDescription>此操作不可恢复，删除后评论将立即从前后台消失。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
