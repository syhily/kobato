import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { CommentEditOutput, CommentRawOutput } from '@kobato/shared/types/comments'

import { orpcQuery } from '@kobato/client/api/orpc-query'
import { EMPTY_LEXICAL_COMMENT_BODY, isLexicalCommentBodyBlank } from '@kobato/shared/lexical/comment-schema'
import { Button } from '@kobato/ui/components/button'
import { useCommentsActions } from '@kobato/ui/public/comments/comments-context'
import { LazyCommentBodyEditor } from '@kobato/ui/public/comments/LazyCommentBodyEditor'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

interface InlineEditFormProps {
  commentId: number | string
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ commentId, onCancel, onSaved }: InlineEditFormProps) {
  const actions = useCommentsActions('InlineEditForm')
  const [body, setBody] = useState<LexicalCommentBody>(EMPTY_LEXICAL_COMMENT_BODY)
  const [initialBody, setInitialBody] = useState<LexicalCommentBody>(EMPTY_LEXICAL_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const raw = useMutation({
    ...orpcQuery.comments.getRaw.mutationOptions(),
    onSuccess: (payload: CommentRawOutput) => {
      const loadedBody = payload.body ?? EMPTY_LEXICAL_COMMENT_BODY
      setInitialBody(loadedBody)
      setBody(loadedBody)
      setBodyKey((k) => k + 1)
      setLoaded(true)
    },
  })
  const editAction = useMutation({
    ...orpcQuery.comments.edit.mutationOptions(),
    onSuccess: (payload: CommentEditOutput) => {
      actions.onEdited(payload.comment)
      onSaved(payload.comment)
    },
  })

  const { mutate: loadRawBody } = raw
  useEffect(() => {
    loadRawBody({ rid: String(commentId) })
  }, [commentId, loadRawBody])

  const saving = editAction.isPending

  const handleSave = () => {
    if (isLexicalCommentBodyBlank(body)) {
      return
    }
    editAction.mutate({ rid: String(commentId), body })
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        initialBody={initialBody}
        bodyKey={`edit-${commentId}-${bodyKey}`}
        onBodyChange={setBody}
        disabled={!loaded || saving}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant="default"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleSave}
          disabled={!loaded || saving}
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
