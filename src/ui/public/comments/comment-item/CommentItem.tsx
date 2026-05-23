import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { CommentRow } from '@/ui/public/comments/comment-item/CommentRow'
import { asKey, childrenListClass, useCommentsLeafContext } from '@/ui/public/comments/comment-item/helpers'

export interface CommentItemProps {
  depth: number
  comment: CommentItemType
  /** Renders the "等待审核" hint over the body. Falls back to `comment.isPending`. */
  pending?: boolean
  /**
   * Standalone admin override. When `<CommentItem>` is rendered outside the
   * `<Comments>` orchestrator (e.g. SSR snapshot tests), callers pass this
   * directly; in compound usage the value lifts from context.
   */
  mode?: 'admin' | 'public'
}

// Self-recursive comment node. The previous implementation accepted a
// `renderChild` render-prop and an `actions` bag so the orchestrator could
// override behaviour for every depth. Now that the parent `<Comments>`
// publishes the same orchestration via `CommentsContext` (see
// `vercel-composition-patterns/architecture-prefer-children-over-render-props`),
// each `CommentItem` recurses by component name and reads what it needs
// directly from context. The `admin` and `pending` props remain on the
// public surface for callers that render `<CommentItem>` standalone (SSR
// snapshots, the legacy `<Comment>` helper).
export function CommentItem(props: CommentItemProps) {
  return props.depth === 1 ? <RootComment {...props} /> : <NestedComment {...props} />
}

function RootComment({ comment, depth, pending, mode: propMode }: CommentItemProps) {
  const leaf = useCommentsLeafContext(propMode)
  const children = comment.children ?? []
  const isReplyTarget = leaf.activeReplyToId !== 0 && asKey(comment.id) === asKey(leaf.activeReplyToId)
  const childrenTail = depth === 1 && isReplyTarget ? leaf.replyForm : null
  return (
    <CommentRow comment={comment} depth={depth} pending={pending} mode={propMode}>
      {(children.length > 0 || childrenTail) && (
        <ul className={childrenListClass}>
          {children.map((child) => (
            <CommentItem key={asKey(child.id)} comment={child} depth={depth + 1} mode={propMode} />
          ))}
          {!!childrenTail && <li>{childrenTail}</li>}
        </ul>
      )}
    </CommentRow>
  )
}

function NestedComment({ comment, depth, pending, mode: propMode }: CommentItemProps) {
  const leaf = useCommentsLeafContext(propMode)
  const children = comment.children ?? []
  const isReplyTarget = leaf.activeReplyToId !== 0 && asKey(comment.id) === asKey(leaf.activeReplyToId)
  const afterComment = depth !== 1 && isReplyTarget ? leaf.replyForm : null
  return (
    <>
      <CommentRow comment={comment} depth={depth} pending={pending} mode={propMode} />
      {!!afterComment && <li>{afterComment}</li>}
      {children.map((child) => (
        <CommentItem key={asKey(child.id)} comment={child} depth={depth + 1} mode={propMode} />
      ))}
    </>
  )
}
