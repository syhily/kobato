import { CommentsAvatarCard } from '@kobato/web-admin/ui/settings/comments/CommentsAvatarCard.tsx'
import { CommentsPaginationCard } from '@kobato/web-admin/ui/settings/comments/CommentsPaginationCard.tsx'
import { CommentsTokenCard } from '@kobato/web-admin/ui/settings/comments/CommentsTokenCard.tsx'
import { type CommentsFormProps } from '@kobato/web-admin/ui/settings/comments/model.ts'

export function CommentsForm({ comments }: CommentsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CommentsPaginationCard comments={comments} />
      <CommentsAvatarCard comments={comments} />
      <CommentsTokenCard comments={comments} />
    </div>
  )
}
