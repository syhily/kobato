import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useRevalidator } from 'react-router'

import type { CommentItemWire as CommentItemType } from '@/shared/types/comments'

import { orpcQuery } from '@/client/api/orpc-query'
import { Button } from '@/ui/components/button'
import { isInklingCommentBlank } from '@/ui/public/comments/comment-body-helpers'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

interface InlineOwnEditFormProps {
  comment: CommentItemType
  onCancel: () => void
  onSaved: () => void
}

export function InlineOwnEditForm({ comment, onCancel, onSaved }: InlineOwnEditFormProps) {
  const revalidator = useRevalidator()
  const updateOwn = useMutation({
    ...orpcQuery.comments.updateOwn.mutationOptions(),
    onSuccess: () => {
      void revalidator.revalidate()
      onSaved()
    },
  })
  const [document, setDocument] = useState(() => comment.body)
  const [bodyKey, setBodyKey] = useState(0)

  const submitting = updateOwn.isPending

  const handleSave = () => {
    if (isInklingCommentBlank(document)) {
      return
    }
    updateOwn.mutate({ commentId: String(comment.id), body: document })
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        initialDocument={comment.body}
        documentKey={`own-edit-${comment.id}-${bodyKey}`}
        onDocumentChange={(next) => {
          setDocument(next)
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
          {submitting ? '保存中...' : '保存'}
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
