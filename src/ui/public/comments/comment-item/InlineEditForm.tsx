import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'
import type { CommentEditOutput, CommentRawOutput } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { EMPTY_COMMENT_EDITOR_STATE, isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
import { Button } from '@/ui/components/button'
import { useCommentsActions } from '@/ui/public/comments/comments-context'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

interface InlineEditFormProps {
  commentId: number | string
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ commentId, onCancel, onSaved }: InlineEditFormProps) {
  const actions = useCommentsActions('InlineEditForm')
  const [body, setBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [initialBody, setInitialBody] = useState<CommentEditorState>(EMPTY_COMMENT_EDITOR_STATE)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const raw = useMutation({
    ...orpcQuery.comments.getRaw.mutationOptions(),
    onSuccess: (payload: CommentRawOutput) => {
      const loadedBody = payload.body ?? EMPTY_COMMENT_EDITOR_STATE
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
    if (isCommentEditorStateBlank(body)) {
      return
    }
    editAction.mutate({ rid: String(commentId), body })
  }

  return (
    <div className="mt-2 block w-full">
      {raw.isError ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-alert" role="alert" aria-live="assertive">
            加载评论原文失败
          </span>
          <Button variant="light" onClick={() => loadRawBody({ rid: String(commentId) })} disabled={raw.isPending}>
            {raw.isPending ? '加载中…' : '重试'}
          </Button>
          <Button variant="light" onMouseDown={(event) => event.preventDefault()} onClick={onCancel}>
            取消
          </Button>
        </div>
      ) : (
        <>
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
            <Button
              variant="light"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCancel}
              disabled={saving}
            >
              取消
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
