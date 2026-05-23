import { useState } from 'react'
import { useRevalidator } from 'react-router'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { orpcQuery, useMutation } from '@/client/api/query'
import { Button } from '@/ui/components/button'
import { CommentBodyEditor, isCommentBodyBlank } from '@/ui/public/comments/CommentBodyEditor'

// Visitor self-edit area. Differs from `<InlineEditForm>`:
// - posts to `comment.updateOwn` (visitor-allowed) instead of `comment.edit` (admin-only)
// - seeds the editor with `comment.body` directly — no extra `comment.getRaw`
//   round trip, mirroring `<MyEditCommentDialog>` in the admin panel
// - server enforces the 30-min auto-approve vs re-pend rule and may flip
//   the row back to pending; we let `useRevalidator()` re-fetch the loader
//   so the parent tree re-renders with the new state instead of guessing
//   client-side
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
  // `comment.body` is the full `PortableTextBody` dialect; the editor
  // expects the narrower `CommentBody`. Comment bodies are validated
  // against `commentBodySchema` at insert/update time, so the runtime
  // invariant holds (see the parallel cast in `MyEditCommentDialog`).
  const seed = comment.body as CommentBody
  const [body, setBody] = useState<CommentBody>(seed)
  const [bodyKey, setBodyKey] = useState(0)

  const submitting = updateOwn.isPending

  const handleSave = () => {
    if (isCommentBodyBlank(body)) {
      return
    }
    updateOwn.mutate({ commentId: String(comment.id), body })
  }

  return (
    <div className="mt-2 block w-full">
      <CommentBodyEditor
        initialBody={seed}
        bodyKey={`own-edit-${comment.id}-${bodyKey}`}
        onBodyChange={(next) => {
          setBody(next)
          // Bump the key only on the first user edit so the editor
          // doesn't tear down mid-keystroke; this keeps the cancel/reopen
          // cycle clean without flicker.
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
