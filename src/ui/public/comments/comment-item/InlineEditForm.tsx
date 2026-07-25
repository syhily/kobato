import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'
import type { CommentEditOutput, CommentRawOutput } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { EMPTY_COMMENT_BODY, isCommentBodyBlank } from '@/ui/public/comments/comment-body-helpers'
import { useCommentsActions } from '@/ui/public/comments/comments-context'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

interface InlineEditFormProps {
  commentId: bigint | string
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ commentId, onCancel, onSaved }: InlineEditFormProps) {
  const actions = useCommentsActions('InlineEditForm')
  const [body, setBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [initialBody, setInitialBody] = useState<CommentBody>(EMPTY_COMMENT_BODY)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const raw = useMutation({
    ...orpcQuery.comments.getRaw.mutationOptions(),
    onSuccess: (payload: CommentRawOutput) => {
      const loadedBody = (payload.body ?? []) as CommentBody
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

  useEffect(() => {
    raw.mutate({ rid: String(commentId) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentId])

  const saving = editAction.isPending

  const handleSave = () => {
    if (isCommentBodyBlank(body)) {
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
