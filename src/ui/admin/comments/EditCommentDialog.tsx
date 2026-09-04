import { useMutation, useQuery } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
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
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

export interface EditCommentDialogProps {
  comment: AdminComment | null
  onClose: () => void
  onSaved: (next: { body: CommentEditorState }) => void
}

export function EditCommentDialog({ comment, onClose, onSaved }: EditCommentDialogProps) {
  const [initialBody, setInitialBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [body, setBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [lastCommentId, setLastCommentId] = useState(comment?.id)
  const [lastRawData, setLastRawData] = useState<typeof rawData>(undefined)

  const rawQuery = useQuery(
    orpcQuery.comments.getRaw.queryOptions({
      input: { rid: comment ? idStr(comment.id) : '0' },
      enabled: !!comment,
    }),
  )
  const { data: rawData } = rawQuery

  const editMutation = useMutation({
    ...orpcQuery.comments.edit.mutationOptions(),
    onSuccess: (payload) => onSaved({ body: payload.comment.body }),
    onError: onMutationError('保存评论失败'),
  })

  // Reset the editor when the target comment changes; only refetch on id change.
  if (comment?.id !== lastCommentId) {
    setLastCommentId(comment?.id)
    setLoaded(false)
    setInitialBody(EMPTY_COMMENT_EDITOR_STATE)
    setBody(EMPTY_COMMENT_EDITOR_STATE)
  }
  // Apply raw body once it arrives (or differs from what we last applied).
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
          <DialogTitle>编辑评论</DialogTitle>
          <DialogDescription>修改评论内容后保存，会立即在前台生效。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment) {
              return
            }
            if (isCommentEditorStateBlank(body)) {
              toast.error('评论内容不能为空')
              return
            }
            editMutation.mutate({ rid: idStr(comment.id), body })
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-comment-content">评论内容</Label>
            {rawQuery.isError ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-destructive">评论内容加载失败。</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void rawQuery.refetch()}>
                  重试
                </Button>
              </div>
            ) : (
              <LazyCommentBodyEditor
                initialBody={initialBody}
                bodyKey={`admin-edit-${dialogKey}-${bodyKey}`}
                onBodyChange={setBody}
                disabled={!loaded || submitting}
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={submitting || !loaded} onMouseDown={(event) => event.preventDefault()}>
              <SaveIcon data-icon /> {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
