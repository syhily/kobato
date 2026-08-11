import { useMutation } from '@tanstack/react-query'
import { SendIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { orpcQuery } from '@/client/api/orpc-query'
import { onMutationError } from '@/client/lib/toast-api-error'
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

export interface ReplyCommentDialogProps {
  comment: AdminComment | null
  authorName: string
  authorEmail: string
  onClose: () => void
  onReplied: () => void
}

export function ReplyCommentDialog({ comment, authorName, authorEmail, onClose, onReplied }: ReplyCommentDialogProps) {
  const mutation = useMutation({
    ...orpcQuery.comments.replyComment.mutationOptions(),
    onSuccess: () => {
      onReplied()
    },
    onError: onMutationError('回复发送失败'),
  })
  const [body, setBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [lastCommentId, setLastCommentId] = useState(comment?.id)
  // Bump `bodyKey` so a fresh Tiptap instance never leaks the previous reply.
  if (comment?.id !== lastCommentId) {
    setLastCommentId(comment?.id)
    setBody(EMPTY_COMMENT_BODY)
    setBodyKey((k) => k + 1)
  }

  const open = comment !== null
  const submitting = mutation.isPending
  const dialogKey = comment ? idStr(comment.id) : 'empty'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>回复评论</DialogTitle>
          <DialogDescription>
            以管理员身份 ({authorName}) 回复 {comment?.name ?? ''} 的评论。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!comment) {
              return
            }
            if (isCommentBodyBlank(body)) {
              toast.error('回复内容不能为空')
              return
            }
            if (!authorEmail) {
              toast.error('无法获取管理员邮箱，请刷新页面重试')
              return
            }
            if (!comment.pagePublicId) {
              toast.error('该评论缺少有效的目标页面标识，无法回复')
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
            <Label htmlFor="reply-comment-content">回复内容</Label>
            <CommentBodyEditor
              initialBody={EMPTY_COMMENT_BODY}
              bodyKey={`admin-reply-${dialogKey}-${bodyKey}`}
              onBodyChange={setBody}
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
              <XIcon data-icon /> 取消
            </Button>
            <Button type="submit" disabled={submitting} onMouseDown={(event) => event.preventDefault()}>
              <SendIcon data-icon /> {submitting ? '发送中…' : '发送回复'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
