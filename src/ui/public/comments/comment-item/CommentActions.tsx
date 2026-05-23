import { useRevalidator } from 'react-router'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { orpcQuery, useMutation } from '@/client/api/query'
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
  admin: boolean | undefined
  /** Open the admin / legacy-token edit area (round-trips through `comment.edit`). */
  onEditAdmin: () => void
  /** Open the visitor self-edit area (posts to `comment.updateOwn`). */
  onEditOwn: () => void
}

export function CommentActions({ comment, admin: propAdmin, onEditAdmin, onEditOwn }: CommentActionsProps) {
  const siteIdentity = useSiteIdentity()
  const leaf = useCommentsLeafContext(propAdmin)
  const revalidator = useRevalidator()
  const approve = useMutation({
    ...orpcQuery.admin.comments.approve.mutationOptions(),
    onSuccess: () => leaf.onApproved(comment.id),
  })
  const remove = useMutation({
    ...orpcQuery.admin.comments.delete.mutationOptions(),
    onSuccess: () => leaf.onDeleted(comment.id),
  })

  // Visitor-scoped delete-request toggles.
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
  // Admin already has the admin-edit affordance below; don't duplicate
  // the button for an admin who happens to also own the row.
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
        // Keep the currently-focused reply/edit editor focused while the
        // click resolves. Without this, mousedown blurs the
        // contenteditable, `:focus-within` on the editor wrapper drops,
        // the toolbar collapses from `flex` to `hidden`, and the layout
        // shift between mousedown and mouseup makes the click miss the
        // button — the user has to click "回复" twice.
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
          <button
            type="button"
            className={cn(commentFooterButtonClass, 'hover:text-alert')}
            data-rid={comment.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleRequestDelete}
            disabled={deleteToggleDisabled}
          >
            申请删除
          </button>
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
