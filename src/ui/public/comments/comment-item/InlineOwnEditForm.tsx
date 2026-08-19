import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { isCommentBodyBlank } from '@/ui/public/comments/comment-body-helpers'
import { useCommentsActions } from '@/ui/public/comments/comments-context'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

interface InlineOwnEditFormProps {
  comment: CommentItemType
  onCancel: () => void
  onSaved: () => void
}

export function InlineOwnEditForm({ comment, onCancel, onSaved }: InlineOwnEditFormProps) {
  const actions = useCommentsActions('InlineOwnEditForm')
  const updateOwn = useMutation({
    ...orpcQuery.comments.updateOwn.mutationOptions(),
    onSuccess: (payload) => {
      // The procedure returns the updated wire comment — sync it through the reducer, no loader revalidation.
      actions.onEdited(payload.comment)
      onSaved()
    },
  })
  const seed = comment.body as CommentBody
  const [body, setBody] = useState<CommentBody>(seed)

  const submitting = updateOwn.isPending

  const handleSave = () => {
    if (isCommentBodyBlank(body)) {
      return
    }
    updateOwn.mutate({ commentId: comment.id, body })
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        initialBody={seed}
        // The seed is synchronous (unlike InlineEditForm's async getRaw), so a
        // static key suffices — bumping it on the first editor update would
        // re-run the reset effect and wipe the user's first keystrokes.
        bodyKey={`own-edit-${comment.id}`}
        onBodyChange={setBody}
        disabled={submitting}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="default"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleSave}
          disabled={submitting}
        >
          {submitting ? '保存中…' : '保存'}
        </Button>
        <Button
          variant="light"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
          disabled={submitting}
        >
          取消
        </Button>
      </div>
    </div>
  )
}
