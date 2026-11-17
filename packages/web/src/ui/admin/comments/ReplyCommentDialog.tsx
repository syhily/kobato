import type { AdminCommentWire as AdminComment } from '@kobato/shared/contracts/comments.ts'
import type { CommentEditorState } from '@kobato/shared/lexical/comment-schema.ts'

import { EMPTY_COMMENT_EDITOR_STATE, isCommentEditorStateBlank } from '@kobato/shared/lexical/comment-schema.ts'
import { idStr } from '@kobato/shared/utils/tools.ts'
import { Button } from '@kobato/ui/components/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kobato/ui/components/dialog.tsx'
import { Label } from '@kobato/ui/components/label.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { onMutationError } from '@kobato/web/client/lib/toast-api-error.ts'
import { LazyCommentBodyEditor } from '@kobato/web/ui/public/comments/LazyCommentBodyEditor.tsx'
import { useMutation } from '@tanstack/react-query'
import { SendIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
