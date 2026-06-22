import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { CommentEditOutput, CommentItemWire as CommentItemType, CommentRawOutput } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { Button } from '@/ui/components/button'
import { isInklingCommentBlank } from '@/ui/public/comments/comment-body-helpers'
import { useCommentsLeafContext } from '@/ui/public/comments/comment-item/helpers'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

interface InlineEditFormProps {
  commentId: bigint | string
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ commentId, onCancel, onSaved }: InlineEditFormProps) {
  const leaf = useCommentsLeafContext(undefined)
  const [document, setDocument] = useState(() => EMPTY_INKLING_DOCUMENT)
  const [initialDocument, setInitialDocument] = useState(() => EMPTY_INKLING_DOCUMENT)
  const [bodyKey, setBodyKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const raw = useMutation({
    ...orpcQuery.comments.getRaw.mutationOptions(),
    onSuccess: (payload: CommentRawOutput) => {
      const loadedDocument = payload.body ?? EMPTY_INKLING_DOCUMENT
      setInitialDocument(loadedDocument)
      setDocument(loadedDocument)
      setBodyKey((k) => k + 1)
      setLoaded(true)
    },
  })
  const editAction = useMutation({
    ...orpcQuery.comments.edit.mutationOptions(),
    onSuccess: (payload: CommentEditOutput) => {
      leaf.onEdited(payload.comment)
      onSaved(payload.comment)
    },
  })

  useEffect(() => {
    raw.mutate({ rid: String(commentId) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentId])

  const saving = editAction.isPending

  const handleSave = () => {
    if (isInklingCommentBlank(document)) {
      return
    }
    editAction.mutate({ rid: String(commentId), body: document })
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        initialDocument={initialDocument}
        documentKey={`edit-${commentId}-${bodyKey}`}
        onDocumentChange={setDocument}
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
