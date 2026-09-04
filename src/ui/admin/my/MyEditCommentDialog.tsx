import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
import { EMPTY_COMMENT_EDITOR_STATE, isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
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

// Self-edit dialog for `/admin/me/comments`: posts to `comment.updateOwn`
// (visitor-allowed), takes the body from the loader item, and the server
// enforces the 30-min auto-approve vs re-pend rule.
export interface MyEditCommentDialogProps {
  target: { id: string; body: CommentEditorState } | null
  onClose: () => void
  onSaved: () => void
}

export function MyEditCommentDialog({ target, onClose, onSaved }: MyEditCommentDialogProps) {
  const update = useMutation({
    ...orpcQuery.comments.updateOwn.mutationOptions(),
    onSuccess: () => onSaved(),
    onError: onMutationError('保存评论失败'),
  })
  const [initialBody, setInitialBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [body, setBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [bodyKey, setBodyKey] = useState(0)
  const [lastTargetId, setLastTargetId] = useState(target?.id)
  // Reset on identity change — `target` is freshly constructed per row click.
  if (target?.id !== lastTargetId) {
    setLastTargetId(target?.id)
    if (!target) {
      setInitialBody(EMPTY_COMMENT_EDITOR_STATE)
      setBody(EMPTY_COMMENT_EDITOR_STATE)
    } else {
      setInitialBody(target.body)
      setBody(target.body)
      setBodyKey((k) => k + 1)
    }
  }

  const open = target !== null
  const submitting = update.isPending
  const dialogKey = target?.id ?? 'empty'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改评论</DialogTitle>
          <DialogDescription>
            评论发表 30 分钟内修改将直接生效；超过 30 分钟的修改将自动进入待审核状态。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!target) {
              return
            }
            if (isCommentEditorStateBlank(body)) {
              toast.error('评论内容不能为空')
              return
            }
            update.mutate({ commentId: target.id, body })
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="my-edit-comment-content">评论内容</Label>
            <LazyCommentBodyEditor
              initialBody={initialBody}
              bodyKey={`my-edit-${dialogKey}-${bodyKey}`}
              onBodyChange={setBody}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={submitting} onMouseDown={(event) => event.preventDefault()}>
              <SaveIcon data-icon /> {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
