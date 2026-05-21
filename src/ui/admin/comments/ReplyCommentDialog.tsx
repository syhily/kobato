import { SendIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { AdminCommentWire as AdminComment } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { useMutation, orpcQuery } from '@/client/api/query'
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
import { CommentBodyEditor, EMPTY_COMMENT_BODY, isCommentBodyBlank } from '@/ui/public/comments/CommentBodyEditor'

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
  })
  // Reply body is PortableText, not plain text — the public reply form
  // posts the same shape, and the API perimeter validates against
  // `commentBodySchema`. Keeping the admin reply on the same editor
  // means the admin sees a live preview of badges / code / math /
  // footnotes exactly as a visitor would author them.
  const [body, setBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)

  useEffect(() => {
    // Reset the editor body whenever the dialog opens for a new
    // comment, or closes. Bumping `bodyKey` forces `CommentBodyEditor`
    // to remount its Tiptap instance so the previous reply doesn't
    // leak into the next one.
    setBody(EMPTY_COMMENT_BODY)
    setBodyKey((k) => k + 1)
  }, [comment?.id])

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
