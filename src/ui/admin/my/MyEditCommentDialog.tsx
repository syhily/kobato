import { useMutation } from '@tanstack/react-query'
import { SaveIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { orpcQuery } from '@/client/api/orpc-query'
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

// Self-edit dialog for `/admin/me/comments`. Differs from the
// admin `EditCommentDialog`:
// - posts to `comment.updateOwn` (visitor-allowed) instead of `comment.edit` (admin)
// - takes the body straight from the loader-provided `MyCommentItem.body`
//   so there's no extra getRaw round-trip
// - server enforces the 30-min auto-approve vs re-pend rule; the UI
//   surfaces both outcomes through the same success path
export interface MyEditCommentDialogProps {
  target: { id: string; body: CommentBody } | null
  onClose: () => void
  onSaved: () => void
}

export function MyEditCommentDialog({ target, onClose, onSaved }: MyEditCommentDialogProps) {
  const update = useMutation({
    ...orpcQuery.comments.updateOwn.mutationOptions(),
    onSuccess: () => onSaved(),
  })
  const [initialBody, setInitialBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [body, setBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [lastTargetId, setLastTargetId] = useState(target?.id)
  // Reset on identity change, not on every render — `target` is freshly
  // constructed by the parent on each row click.
  if (target?.id !== lastTargetId) {
    setLastTargetId(target?.id)
    if (!target) {
      setInitialBody(EMPTY_COMMENT_BODY)
      setBody(EMPTY_COMMENT_BODY)
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
            if (isCommentBodyBlank(body)) {
              toast.error('评论内容不能为空')
              return
            }
            update.mutate({ commentId: target.id, body })
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="my-edit-comment-content">评论内容</Label>
            <CommentBodyEditor
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
