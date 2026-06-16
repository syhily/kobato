import { useMutation, useQuery } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { CommentBody } from '@/shared/pt/comment-schema'
import type { AdminCommentWire as AdminComment } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
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
import { EMPTY_COMMENT_BODY, isCommentBodyBlank } from '@/ui/public/comments/comment-body-helpers'
import { CommentBodyEditor } from '@/ui/public/comments/CommentBodyEditor'

export interface EditCommentDialogProps {
  comment: AdminComment | null
  onClose: () => void
  onSaved: (next: { body: CommentBody }) => void
}

export function EditCommentDialog({ comment, onClose, onSaved }: EditCommentDialogProps) {
  const [initialBody, setInitialBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [body, setBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const { data: rawData } = useQuery(
    orpcQuery.comments.getRaw.queryOptions({
      input: { rid: comment ? idStr(comment.id) : '0' },
      enabled: !!comment,
    }),
  )

  const editMutation = useMutation({
    ...orpcQuery.comments.edit.mutationOptions(),
    onSuccess: (payload) => onSaved({ body: payload.comment.body }),
  })

  useEffect(() => {
    if (!comment) {
      setLoaded(false)
      setInitialBody(EMPTY_COMMENT_BODY)
      setBody(EMPTY_COMMENT_BODY)
      return
    }
    setLoaded(false)
    // intentionally only refetch when comment id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment?.id])

  useEffect(() => {
    if (!comment || !rawData) {
      return
    }
    const loadedBody = (rawData.body ?? []) as CommentBody
    setInitialBody(loadedBody)
    setBody(loadedBody)
    setBodyKey((k) => k + 1)
    setLoaded(true)
  }, [rawData, comment])

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
            if (isCommentBodyBlank(body)) {
              toast.error('评论内容不能为空')
              return
            }
            editMutation.mutate({ rid: idStr(comment.id), body })
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-comment-content">评论内容</Label>
            <CommentBodyEditor
              initialBody={initialBody}
              bodyKey={`admin-edit-${dialogKey}-${bodyKey}`}
              onBodyChange={setBody}
              disabled={!loaded || submitting}
            />
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
