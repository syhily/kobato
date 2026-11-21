import { CommentsAvatarCard } from '@kobato/web-admin/ui/settings/comments/CommentsAvatarCard'
import { CommentsPaginationCard } from '@kobato/web-admin/ui/settings/comments/CommentsPaginationCard'
import { CommentsTokenCard } from '@kobato/web-admin/ui/settings/comments/CommentsTokenCard'
import { type CommentsFormProps } from '@kobato/web-admin/ui/settings/comments/model'

export function CommentsForm({ comments }: CommentsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CommentsPaginationCard comments={comments} />
      <CommentsAvatarCard comments={comments} />
      <CommentsTokenCard comments={comments} />
    </div>
  )
}
