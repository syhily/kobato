import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { orpcQuery } from '@/client/api/orpc-query'
import { isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'
import { useCommentsActions, useCommentsIdentity } from '@/ui/public/comments/comments-context'
import { LazyCommentBodyEditor } from '@/ui/public/comments/LazyCommentBodyEditor'

interface InlineEditFormProps {
  comment: CommentItemType
  onCancel: () => void
  onSaved: (comment: CommentItemType) => void
}

export function InlineEditForm({ comment, onCancel, onSaved }: InlineEditFormProps) {
  const { t } = useI18n()
  const actions = useCommentsActions('InlineEditForm')
  const identity = useCommentsIdentity('InlineEditForm')
  // The wire shape is shared, but the policy differs: moderators hit the
  // admin route (rewrite in place), owners hit the own-edit route (grace
  // window + re-moderation fences).
  const onSuccess = (payload: { comment: CommentItemType }) => {
    actions.onEdited(payload.comment)
    onSaved(payload.comment)
  }
  const adminEdit = useMutation({
    ...orpcQuery.admin.comments.edit.mutationOptions(),
    onSuccess,
  })
  const ownEdit = useMutation({
    ...orpcQuery.comments.edit.mutationOptions(),
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
          {saving ? t('common.state.saving') : t('common.action.save')}
        </Button>
        <Button variant="light" onMouseDown={(event) => event.preventDefault()} onClick={onCancel} disabled={saving}>
          {t('common.action.cancel')}
        </Button>
      </div>
    </div>
  )
}
