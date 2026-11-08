import { useMutation } from '@tanstack/react-query'
import { SendIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { EMPTY_COMMENT_EDITOR_STATE, isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
import { idStr } from '@/shared/utils/tools'
import { Button } from '@/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/components/dialog'
import { Label } from '@/ui/components/label'
import { useI18n } from '@/ui/lib/I18nProvider'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

export interface ReplyCommentDialogProps {
  comment: AdminComment | null
  authorName: string
  authorEmail: string
  onClose: () => void
  onReplied: () => void
}

export function ReplyCommentDialog({ comment, authorName, authorEmail, onClose, onReplied }: ReplyCommentDialogProps) {
  const { t } = useI18n()
  const mutation = useMutation({
    ...orpcQuery.comments.replyComment.mutationOptions(),
    onSuccess: () => {
      onReplied()
    },
    onError: onMutationError('admin.toast.replySendFailed', t),
  })
  const [body, setBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [bodyKey, setBodyKey] = useState(0)
  const [lastCommentId, setLastCommentId] = useState(comment?.id)
  // Bump `bodyKey` so a fresh editor never leaks the previous reply.
  if (comment?.id !== lastCommentId) {
    setLastCommentId(comment?.id)
    setBody(EMPTY_COMMENT_EDITOR_STATE)
    setBodyKey((k) => k + 1)
  }

  const open = comment !== null
  const submitting = mutation.isPending
  const dialogKey = comment ? idStr(comment.id) : 'empty'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.comments.reply.title')}</DialogTitle>
          <DialogDescription>
            {t('admin.comments.reply.description', { name: authorName, author: comment?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment) {
              return
            }
            if (isCommentEditorStateBlank(body)) {
              toast.error(t('admin.comments.reply.empty'))
              return
            }
            if (!authorEmail) {
              toast.error(t('admin.comments.reply.noEmail'))
              return
            }
            if (!comment.pagePublicId) {
              toast.error(t('admin.comments.reply.noPage'))
              return
            }
            mutation.mutate({
              page_key: comment.pagePublicId,
              name: authorName,
              email: authorEmail,
              body,
              rid: Number.parseInt(idStr(comment.id), 10),
            })
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="reply-comment-content">{t('admin.comments.reply.content')}</Label>
            <LazyCommentBodyEditor
              eager
              initialBody={EMPTY_COMMENT_EDITOR_STATE}
              bodyKey={`admin-reply-${dialogKey}-${bodyKey}`}
              onBodyChange={setBody}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={submitting} onMouseDown={(event) => event.preventDefault()}>
              <SendIcon data-icon /> {submitting ? t('admin.comments.reply.sending') : t('admin.comments.reply.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
