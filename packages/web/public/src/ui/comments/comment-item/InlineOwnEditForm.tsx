import type { CommentItemWire as CommentItemType } from '@kobato/api/contracts/comments'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'

import { isCommentEditorStateBlank } from '@kobato/inkling/headless/comment-schema'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { useCommentsActions } from '@kobato/web-public/ui/comments/comments-context'
import { LazyCommentBodyEditor } from '@kobato/web-public/ui/comments/LazyCommentBodyEditor'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

interface InlineOwnEditFormProps {
  comment: CommentItemType
  onCancel: () => void
  onSaved: () => void
}

export function InlineOwnEditForm({ comment, onCancel, onSaved }: InlineOwnEditFormProps) {
  const { t } = useI18n()
  const actions = useCommentsActions('InlineOwnEditForm')
  const updateOwn = useMutation({
    ...orpcQuery.account.comments.updateOwn.mutationOptions(),
    onSuccess: (payload) => {
      actions.onEdited(payload.comment)
      onSaved()
    },
  })
  const seed = comment.body
  const [body, setBody] = useState<CommentEditorState>(seed)

  const submitting = updateOwn.isPending

  const handleSave = () => {
    if (isCommentEditorStateBlank(body)) {
      return
    }
    updateOwn.mutate({ commentId: comment.id, body })
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        eager
        focusOnMount
        initialBody={seed}
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
          {submitting ? t('common.state.saving') : t('common.action.save')}
        </Button>
        <Button
          variant="light"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
          disabled={submitting}
        >
          {t('common.action.cancel')}
        </Button>
      </div>
    </div>
  )
}
