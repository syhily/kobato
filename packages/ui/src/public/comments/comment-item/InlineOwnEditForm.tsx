import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { isLexicalCommentBodyBlank } from '@kobato/shared/lexical/comment-schema'
import { Button } from '@kobato/ui/components/button'
import { useCommentsActions } from '@kobato/ui/public/comments/comments-context'
import { LazyCommentBodyEditor } from '@kobato/ui/public/comments/LazyCommentBodyEditor'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

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
      // The procedure returns the updated wire comment — sync it through
      // the reducer like every other mutation, no loader revalidation.
      actions.onEdited(payload.comment)
      onSaved()
    },
  })
  const seed = comment.body as LexicalCommentBody
  const [body, setBody] = useState<LexicalCommentBody>(seed)
  const [bodyKey, setBodyKey] = useState(0)

  const submitting = updateOwn.isPending

  const handleSave = () => {
    if (isLexicalCommentBodyBlank(body)) {
      return
    }
    updateOwn.mutate({ commentId: String(comment.id), body })
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        initialBody={seed}
        bodyKey={`own-edit-${comment.id}-${bodyKey}`}
        onBodyChange={(next) => {
          setBody(next)
          setBodyKey((k) => (k === 0 ? k + 1 : k))
        }}
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
