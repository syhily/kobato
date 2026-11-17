import type { CommentItemWire as CommentItemType } from '@kobato/contracts/comments.ts'
import type { CommentEditorState } from '@kobato/pt/comment-schema.ts'

import { isCommentEditorStateBlank } from '@kobato/pt/comment-schema.ts'
import { Button } from '@kobato/ui/components/button.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { orpcQuery } from '@kobato/web/client/api/orpc-query.ts'
import { useCommentsActions } from '@kobato/web/ui/public/comments/comments-context.ts'
import { LazyCommentBodyEditor } from '@kobato/web/ui/public/comments/LazyCommentBodyEditor.tsx'
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
    ...orpcQuery.comments.updateOwn.mutationOptions(),
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
        // The seed is synchronous, so a static key suffices; bumping it on the first editor
        // update would re-run the reset effect and wipe the first keystrokes.
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
