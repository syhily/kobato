import type { CommentItemWire as CommentItemType } from '@kobato/shared/contracts/comments'

import { CommentRow } from '@kobato/ui/public/comments/comment-item/CommentRow'
import { asKey, childrenListClass } from '@kobato/ui/public/comments/comment-item/helpers'
import { useCommentsReplySlot } from '@kobato/ui/public/comments/comments-context'
import { memo } from 'react'

export interface CommentItemProps {
  depth: number
  comment: CommentItemType
  /** Renders the "pending review" hint over the body. Falls back to `comment.isPending`. */
  pending?: boolean
}

// Memoized so a tree dispatch that preserves item references re-renders only
// the affected leaf; reply-toggle still re-renders every wrapper via the reply slot context.
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
