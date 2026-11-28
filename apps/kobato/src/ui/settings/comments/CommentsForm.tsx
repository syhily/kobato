import { CommentsAvatarCard } from '@/ui/settings/comments/CommentsAvatarCard'
import { CommentsPaginationCard } from '@/ui/settings/comments/CommentsPaginationCard'
import { CommentsTokenCard } from '@/ui/settings/comments/CommentsTokenCard'
import { type CommentsFormProps } from '@/ui/settings/comments/model'

export function CommentsForm({ comments }: CommentsFormProps) {
  return (
    <div className="flex flex-col gap-5">
      <CommentsPaginationCard comments={comments} />
      <CommentsAvatarCard comments={comments} />
      <CommentsTokenCard comments={comments} />
    </div>
  )
}
