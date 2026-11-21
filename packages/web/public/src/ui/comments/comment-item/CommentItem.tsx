import type { CommentItemWire as CommentItemType } from '@kobato/contracts/comments'

import { CommentRow } from '@kobato/web-public/ui/comments/comment-item/CommentRow'
import { asKey, childrenListClass } from '@kobato/web-public/ui/comments/comment-item/presentation'
import { useCommentsReplySlot } from '@kobato/web-public/ui/comments/comments-context'
import { memo } from 'react'

export interface CommentItemProps {
  depth: number
  comment: CommentItemType
  pending?: boolean
}

export const CommentItem = memo(function CommentItem(props: CommentItemProps) {
  return props.depth === 1 ? <RootComment {...props} /> : <NestedComment {...props} />
})

function RootComment({ comment, depth, pending }: CommentItemProps) {
  const { activeReplyToId, replyForm } = useCommentsReplySlot('CommentItem')
  const children = comment.children ?? []
  const isReplyTarget = activeReplyToId !== 0 && asKey(comment.id) === asKey(activeReplyToId)
  const childrenTail = depth === 1 && isReplyTarget ? replyForm : null
  return (
    <CommentRow comment={comment} depth={depth} pending={pending}>
      {(children.length > 0 || childrenTail) && (
        <ul className={childrenListClass}>
          {children.map((child) => (
            <CommentItem key={asKey(child.id)} comment={child} depth={depth + 1} />
          ))}
          {!!childrenTail && <li>{childrenTail}</li>}
        </ul>
      )}
    </CommentRow>
  )
}

function NestedComment({ comment, depth, pending }: CommentItemProps) {
  const { activeReplyToId, replyForm } = useCommentsReplySlot('CommentItem')
  const children = comment.children ?? []
  const isReplyTarget = activeReplyToId !== 0 && asKey(comment.id) === asKey(activeReplyToId)
  const afterComment = depth !== 1 && isReplyTarget ? replyForm : null
  return (
    <>
      <CommentRow comment={comment} depth={depth} pending={pending} />
      {!!afterComment && <li>{afterComment}</li>}
      {children.map((child) => (
        <CommentItem key={asKey(child.id)} comment={child} depth={depth + 1} />
      ))}
    </>
  )
}
