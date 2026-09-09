import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { CommentEditOutput } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
import { Button } from '@/ui/components/button'
import { CommentBodyEditor } from '@/ui/public/comments/CommentBodyEditor'
import { useCommentsActions } from '@/ui/public/comments/comments-context'

interface InlineEditFormProps {
  comment: CommentItemType
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ comment, onCancel, onSaved }: InlineEditFormProps) {
  const actions = useCommentsActions('InlineEditForm')
  const editAction = useMutation({
    ...orpcQuery.comments.edit.mutationOptions(),
    onSuccess: (payload: CommentEditOutput) => {
      actions.onEdited(payload.comment)
      onSaved(payload.comment)
    },
  })
  const seed = comment.body
  const [body, setBody] = useState<CommentEditorState>(seed)

  const saving = editAction.isPending

  const handleSave = () => {
    if (isCommentEditorStateBlank(body)) {
      return
    }
    editAction.mutate({ rid: String(comment.id), body })
  }

  return (
    <div className="mt-2 block w-full">
      <CommentBodyEditor
        initialBody={seed}
        // The wire row already carries `body`, so the seed is synchronous and a
        // static key suffices — bumping it on the first editor update would
        // re-run the reset effect and wipe the user's first keystrokes.
        bodyKey={`edit-${comment.id}`}
        onBodyChange={setBody}
        disabled={saving}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="default"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button variant="light" onMouseDown={(event) => event.preventDefault()} onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </div>
    </div>
  )
}
