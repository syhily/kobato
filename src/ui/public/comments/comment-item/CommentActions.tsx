import { useMutation } from '@tanstack/react-query'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

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
import { useI18n } from '@/ui/lib/I18nProvider'
import { commentFlags } from '@/ui/public/comments/comment-item/comment-flags'
import { commentFooterButtonClass } from '@/ui/public/comments/comment-item/helpers'
import { useCommentsActions, useCommentsIdentity } from '@/ui/public/comments/comments-context'

interface CommentActionsProps {
  comment: CommentItemType
  /** Open the inline editor — moderators hit `admin.comments.edit`, token
   *  owners hit `comments.edit` (same own-edit policy as `updateOwn`). */
  onEditAdmin: () => void
  /** Open the visitor self-edit area (posts to `comment.updateOwn`). */
  onEditOwn: () => void
}

export function CommentActions({ comment, onEditAdmin, onEditOwn }: CommentActionsProps) {
  const siteIdentity = useSiteIdentity()
  const { t } = useI18n()
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

  // Own-comment mutations return the updated wire comment — route through the same reducer action, no loader revalidate.
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
  const handleApprove = () => approve.mutate({ commentId: comment.id })
  const handleDelete = () => remove.mutate({ commentId: comment.id })
  const handleRequestDelete = () => requestDelete.mutate({ commentId: comment.id })
  const handleCancelDelete = () => cancelDelete.mutate({ commentId: comment.id })

  return (
    <div className="flex flex-1 items-center gap-2 text-xs text-ink-4">
      <time>{formatLocalDate(comment.createAt, 'yyyy-MM-dd HH:mm', siteIdentity)}</time>
      <button
        type="button"
        className={cn(commentFooterButtonClass, 'hover:text-brand')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleReply}
      >
        {t('public.comments.reply')}
      </button>
      {(identity.admin || flags.isMine) && (
        <button
          type="button"
          className={cn(commentFooterButtonClass, 'hover:text-alert')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onEditAdmin}
        >
          {t('public.comments.edit')}
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
          {t('public.comments.modify')}
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
            {t('public.comments.withdrawDelete')}
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
                  {t('public.comments.requestDelete')}
                </button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('public.comments.requestDeleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('public.comments.requestDeleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.action.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleRequestDelete}>
                  {t('public.comments.confirmRequest')}
                </AlertDialogAction>
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
              {t('public.comments.approve')}
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
                  {t('common.action.delete')}
                </button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('public.comments.deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('public.comments.deleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.action.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>{t('common.action.delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
