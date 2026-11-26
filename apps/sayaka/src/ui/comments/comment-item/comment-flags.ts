import type { CommentItemWire as CommentItemType } from '@kobato/api/contracts/public/comments'
import type { MyCommentOwnership } from '@sayaka/ui/comments/comments-context'

import { asKey } from '@sayaka/ui/comments/comment-item/presentation'

export interface CommentIdentity {
  currentUserId: string | null
  myComments: ReadonlyMap<string, MyCommentOwnership>
}

export interface CommentFlags {
  isMine: boolean
  isOwnedByCurrentUser: boolean
  hasPendingDelete: boolean
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
