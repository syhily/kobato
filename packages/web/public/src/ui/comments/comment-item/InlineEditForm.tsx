import type { CommentItemWire as CommentItemType } from '@kobato/api/contracts/public/comments'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'

import { isCommentEditorStateBlank } from '@kobato/inkling/headless/comment-schema'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { orpcQuery } from '@kobato/web-client/api/orpc-query'
import { useCommentsActions, useCommentsIdentity } from '@kobato/web-public/ui/comments/comments-context'
import { LazyCommentBodyEditor } from '@kobato/web-public/ui/comments/LazyCommentBodyEditor'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

interface InlineEditFormProps {
  comment: CommentItemType
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ comment, onCancel, onSaved }: InlineEditFormProps) {
  const { t } = useI18n()
  const actions = useCommentsActions('InlineEditForm')
  const identity = useCommentsIdentity('InlineEditForm')
  const onSuccess = (payload: { comment: CommentItemType }) => {
    actions.onEdited(payload.comment)
    onSaved(payload.comment)
  }
  const adminEdit = useMutation({
    ...orpcQuery.admin.comments.edit.mutationOptions(),
    onSuccess,
  })
  const ownEdit = useMutation({
    ...orpcQuery.public.comments.edit.mutationOptions(),
    onSuccess,
  })
  const seed = comment.body
  const [body, setBody] = useState<CommentEditorState>(seed)

  const saving = identity.admin ? adminEdit.isPending : ownEdit.isPending

  const handleSave = () => {
    if (isCommentEditorStateBlank(body)) {
      return
    }
    if (identity.admin) {
      adminEdit.mutate({ commentId: comment.id, body })
    } else {
      ownEdit.mutate({ rid: comment.id, body })
    }
  }

  return (
    <div className="mt-2 block w-full">
      <LazyCommentBodyEditor
        eager
        focusOnMount
        initialBody={seed}
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
          {saving ? t('common.state.saving') : t('common.action.save')}
        </Button>
        <Button variant="light" onMouseDown={(event) => event.preventDefault()} onClick={onCancel} disabled={saving}>
          {t('common.action.cancel')}
        </Button>
      </div>
    </div>
  )
}
