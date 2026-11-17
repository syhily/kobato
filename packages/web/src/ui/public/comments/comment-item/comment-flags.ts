import type { CommentItemWire as CommentItemType } from '@kobato/contracts/comments.ts'
import type { MyCommentOwnership } from '@kobato/web/ui/public/comments/comments-context.ts'

import { asKey } from '@kobato/web/ui/public/comments/comment-item/helpers.ts'

/** Slice of viewer identity the ownership predicates read — structurally satisfied
 *  by `CommentsIdentityContextValue`. */
export interface CommentIdentity {
  currentUserId: string | null
  myComments: ReadonlyMap<string, MyCommentOwnership>
}

/** Single source of the per-comment ownership / moderation predicates, read by
 *  `CommentRow` and `CommentActions`. */
export interface CommentFlags {
  /** Token-claimed ownership from the anonymous "my comments" merge. */
  isMine: boolean
  /** Session-user ownership (`comment.userId` matches the logged-in viewer). */
  isOwnedByCurrentUser: boolean
  /** The author asked for deletion; the comment awaits admin action. */
  hasPendingDelete: boolean
  /** Edit-token expiry (ms epoch) behind the editable hint, when mine. */
  myExpiresAt: number | undefined
}

export function commentFlags(comment: CommentItemType, identity: CommentIdentity): CommentFlags {
  const key = asKey(comment.id)
  const mine = identity.myComments.get(key)
  return {
    isMine: mine !== undefined,
    isOwnedByCurrentUser: identity.currentUserId !== null && comment.userId === identity.currentUserId,
    hasPendingDelete: comment.deleteRequestedAt !== null && comment.deleteRequestedAt !== undefined,
    myExpiresAt: mine?.expiresAt,
  }
}
