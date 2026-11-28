import type { AdminCommentWire as AdminComment } from '@kobato/api/contracts/admin/comments'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'

import { orpcQuery } from '@kobato/api/browser/orpc-query'
import { idStr } from '@kobato/base/utils/id'
import { LazyCommentBodyEditor } from '@kobato/inkling/comment/LazyCommentBodyEditor'
import { EMPTY_COMMENT_EDITOR_STATE, isCommentEditorStateBlank } from '@kobato/inkling/headless/comment-schema'
import { Button } from '@kobato/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kobato/ui/components/dialog'
import { Label } from '@kobato/ui/components/label'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { onMutationError } from '@kobato/web-kit/ui/lib/toast-api-error'
import { useMutation, useQuery } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useKobatoInklingLabels } from '@/ui/shared/use-inkling-labels'

export interface EditCommentDialogProps {
  comment: AdminComment | null
  onClose: () => void
  onSaved: (next: { body: CommentEditorState; content: string | null }) => void
}

export function EditCommentDialog({ comment, onClose, onSaved }: EditCommentDialogProps) {
  const { t } = useI18n()
  const inklingLabels = useKobatoInklingLabels()
  const [initialBody, setInitialBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [body, setBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [lastCommentId, setLastCommentId] = useState(comment?.id)
  const [lastRawData, setLastRawData] = useState<typeof rawData>(undefined)

  const rawQuery = useQuery(
    orpcQuery.public.comments.getRaw.queryOptions({
      input: { rid: comment ? idStr(comment.id) : '0' },
      enabled: !!comment,
    }),
  )
  const { data: rawData } = rawQuery

  const editMutation = useMutation({
    ...orpcQuery.admin.comments.edit.mutationOptions(),
    onSuccess: (payload) => onSaved({ body: payload.comment.body, content: payload.comment.content }),
    onError: onMutationError('admin.toast.commentSaveFailed', t),
  })

  if (comment?.id !== lastCommentId) {
    setLastCommentId(comment?.id)
    setLoaded(false)
    setInitialBody(EMPTY_COMMENT_EDITOR_STATE)
    setBody(EMPTY_COMMENT_EDITOR_STATE)
  }
  if (rawData !== lastRawData) {
    setLastRawData(rawData)
    if (comment && rawData) {
      const loadedBody = rawData.body ?? EMPTY_COMMENT_EDITOR_STATE
      setInitialBody(loadedBody)
      setBody(loadedBody)
      setBodyKey((k) => k + 1)
      setLoaded(true)
    }
  }

  const open = comment !== null
  const submitting = editMutation.isPending
  const dialogKey = comment ? idStr(comment.id) : 'empty'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.comments.edit.title')}</DialogTitle>
          <DialogDescription>{t('admin.comments.edit.description')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment) {
              return
            }
            if (isCommentEditorStateBlank(body)) {
              toast.error(t('admin.comments.edit.empty'))
              return
            }
            editMutation.mutate({ commentId: idStr(comment.id), body })
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-comment-content">{t('admin.comments.edit.content')}</Label>
            {rawQuery.isError ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-destructive">{t('admin.comments.edit.loadFailed')}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void rawQuery.refetch()}>
                  {t('common.action.retry')}
                </Button>
              </div>
            ) : (
              <LazyCommentBodyEditor
                eager
                labels={inklingLabels}
                initialBody={initialBody}
                bodyKey={`admin-edit-${dialogKey}-${bodyKey}`}
                onBodyChange={setBody}
                disabled={!loaded || submitting}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
              <XIcon data-icon /> {t('common.action.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !loaded} onMouseDown={(event) => event.preventDefault()}>
              <SaveIcon data-icon /> {submitting ? t('admin.my.edit.saving') : t('common.action.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
