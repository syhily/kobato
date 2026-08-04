import type { AdminCommentWire as AdminComment } from '@kobato/shared/contracts/comments'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { LexicalCommentEditor } from '@kobato/editor/comments-editor/lexical/LexicalCommentEditor'
import { EMPTY_LEXICAL_COMMENT_BODY, isLexicalCommentBodyBlank } from '@kobato/shared/lexical/comment-schema'
import { idStr } from '@kobato/shared/utils/tools'
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
  const mutation = useMutation({
    ...orpcQuery.comments.replyComment.mutationOptions(),
    onSuccess: () => {
      onReplied()
    },
  })
  const [body, setBody] = useState<LexicalCommentBody>(EMPTY_LEXICAL_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [lastCommentId, setLastCommentId] = useState(comment?.id)
  // Reset the editor body whenever the dialog opens for a new comment or closes.
  // Bumping `bodyKey` remounts `CommentBodyEditor`'s Tiptap instance so the
  // previous reply doesn't leak into the next one.
  if (comment?.id !== lastCommentId) {
    setLastCommentId(comment?.id)
    setBody(EMPTY_LEXICAL_COMMENT_BODY)
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
            if (isLexicalCommentBodyBlank(body)) {
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
            <LexicalCommentEditor
              initialBody={EMPTY_LEXICAL_COMMENT_BODY}
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
