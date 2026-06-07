import type { CommentItemWire as CommentItemType } from '@/shared/types/comments'

import { CommentItem } from '@/ui/public/comments/comment-item/CommentItem'

export interface CommentProps {
  comments: CommentItemType[]
  mode: 'admin' | 'public'
}

export function Comment({ comments, mode }: CommentProps) {
  return (
    <>
      {comments.map((item) => (
        <CommentItem key={item.id} comment={item} depth={1} mode={mode} />
      ))}
    </>
  )
}
