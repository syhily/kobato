import { useMutation } from '@tanstack/react-query'
import { useRevalidator } from 'react-router'

import type { CommentItemWire as CommentItemType } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { useSiteIdentity } from '@/shared/lib/blog-config-context'
import { formatLocalDate } from '@/shared/utils/formatter'
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
} from '@/ui/components/alert-dialog'
import { cn } from '@/ui/lib/cn'
import { asKey, commentFooterButtonClass, useCommentsLeafContext } from '@/ui/public/comments/comment-item/helpers'

interface CommentActionsProps {
  comment: CommentItemType
  mode?: 'admin' | 'public'
  /** Open the admin / legacy-token edit area (round-trips through `comment.edit`). */
  onEditAdmin: () => void
  /** Open the visitor self-edit area (posts to `comment.updateOwn`). */
  onEditOwn: () => void
}

export function CommentActions({ comment, mode: propMode, onEditAdmin, onEditOwn }: CommentActionsProps) {
  const siteIdentity = useSiteIdentity()
  const leaf = useCommentsLeafContext(propMode)
  const revalidator = useRevalidator()
  const approve = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: () => leaf.onApproved(comment.id),
  })
  const remove = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: () => leaf.onDeleted(comment.id),
  })

  const requestDelete = useMutation({
    ...orpcQuery.comments.requestDeleteOwn.mutationOptions(),
    onSuccess: () => void revalidator.revalidate(),
  })
  const cancelDelete = useMutation({
    ...orpcQuery.comments.cancelDeleteOwn.mutationOptions(),
    onSuccess: () => void revalidator.revalidate(),
  })

  const isOwnedByCurrentUser = leaf.currentUserId !== null && String(comment.userId) === leaf.currentUserId
  const hasPendingDelete = comment.deleteRequestedAt !== null && comment.deleteRequestedAt !== undefined
  const showOwnAffordances = isOwnedByCurrentUser && !leaf.admin
  const ownEditDisabled = hasPendingDelete || requestDelete.isPending || cancelDelete.isPending
  const deleteToggleDisabled = requestDelete.isPending || cancelDelete.isPending

  const handleReply = () => leaf.onReply(Number(comment.id))
  const handleApprove = () => approve.mutate({ rid: String(comment.id) })
  const handleDelete = () => remove.mutate({ rid: String(comment.id) })
  const handleRequestDelete = () => requestDelete.mutate({ commentId: String(comment.id) })
  const handleCancelDelete = () => cancelDelete.mutate({ commentId: String(comment.id) })

  return (
    <div className="flex flex-1 items-center gap-2 text-xs text-ink-4">
      <time>{formatLocalDate(comment.createAt, 'yyyy-MM-dd HH:mm', siteIdentity)}</time>
      <button
        type="button"
        className={cn(commentFooterButtonClass, 'hover:text-brand')}
        data-rid={comment.id}
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleReply}
      >
        回复
      </button>
      {(leaf.admin || leaf.myCommentIds.has(asKey(comment.id))) && (
        <button
          type="button"
          className={cn(commentFooterButtonClass, 'hover:text-alert')}
          data-rid={comment.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onEditAdmin}
        >
          编辑
        </button>
      )}
      {showOwnAffordances && !hasPendingDelete && (
        <button
          type="button"
          className={cn(commentFooterButtonClass, 'hover:text-alert')}
          data-rid={comment.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onEditOwn}
          disabled={ownEditDisabled}
        >
          修改
        </button>
      )}
      {showOwnAffordances &&
        (hasPendingDelete ? (
          <button
            type="button"
            className={cn(commentFooterButtonClass, 'hover:text-brand')}
            data-rid={comment.id}
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
                  data-rid={comment.id}
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
      {leaf.admin && (
        <>
          {comment.isPending && (
            <button
              type="button"
              className={cn(commentFooterButtonClass, 'text-warn')}
              data-rid={comment.id}
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
                  data-rid={comment.id}
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
