import { createContext, use } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

/**
 * Token-claimed ownership of one comment. `expiresAt` (ms epoch) backs the
 * "editable for X more minutes" hint; absent when the token carries no expiry.
 */
export interface MyCommentOwnership {
  expiresAt?: number
}

export interface CommentTreeState {
  items: CommentItemType[]
  rootsLoaded: number
  rootsTotal: number
  replyToId: number
  /**
   * Owned ("my") comments keyed by stringified comment id. Lives in the reducer
   * so the ownership map and the tree update atomically in one dispatch.
   */
  myComments: Map<string, MyCommentOwnership>
}

export type CommentTreeAction =
  | { type: 'reset'; items: CommentItemType[]; rootsTotal: number; rootsLoaded: number }
  | { type: 'append'; items: CommentItemType[]; rootsLoaded: number }
  | { type: 'insertReply'; comment: CommentItemType; rid: number }
  | { type: 'updateComment'; comment: CommentItemType }
  | { type: 'removeComment'; id: bigint | string }
  | { type: 'approveComment'; id: bigint | string }
  | { type: 'setReplyTo'; rid: number }
  | { type: 'mergeMyComments'; comments: CommentItemType[]; expiresAt: Record<string, number> }
  | { type: 'dismissMyComment'; id: string }

/**
 * Hot tree state — a new identity on every dispatch. Only the orchestrator's
 * own slots (Header / List / LoadMore) subscribe; leaves never read this.
 */
export interface CommentsTreeContextValue {
  commentKey: string
  totalCount: number
  state: CommentTreeState
}

/**
 * Viewer identity + ownership. Referentially stable across tree dispatches (the
 * reducer preserves the `myComments` map reference unless ownership itself changes),
 * so leaves subscribed here do not re-render on reply, edit, approve, or load-more.
 */
export interface CommentsIdentityContextValue {
  admin: boolean
  currentUserId: string | null
  myComments: ReadonlyMap<string, MyCommentOwnership>
}

/**
 * The reply-form slot — hot on reply-toggle only. Leaves subscribe to learn
 * whether they host the form; everything else about them stays stable.
 */
export interface CommentsReplySlotContextValue {
  activeReplyToId: number
  replyForm: React.ReactNode
}

export interface CommentsActionsContextValue {
  onReply: (rid: number) => void
  onCancelReply: () => void
  onEdited: (comment: CommentItemType) => void
  onApproved: (id: bigint | string) => void
  onDeleted: (id: bigint | string) => void
  onDismissMyComment: (id: bigint | string) => void
  dispatch: React.Dispatch<CommentTreeAction>
}

export const CommentsTreeContext = createContext<CommentsTreeContextValue | null>(null)
export const CommentsIdentityContext = createContext<CommentsIdentityContextValue | null>(null)
export const CommentsReplySlotContext = createContext<CommentsReplySlotContextValue | null>(null)
export const CommentsActionsContext = createContext<CommentsActionsContextValue | null>(null)

export function useCommentsTree(component: string): CommentsTreeContextValue {
  const ctx = use(CommentsTreeContext)
  if (ctx === null) {
    throw new Error(`<${component}> must be rendered inside <Comments>`)
  }
  return ctx
}

export function useCommentsIdentity(component: string): CommentsIdentityContextValue {
  const ctx = use(CommentsIdentityContext)
  if (ctx === null) {
    throw new Error(`<${component}> must be rendered inside <Comments>`)
  }
  return ctx
}

export function useCommentsReplySlot(component: string): CommentsReplySlotContextValue {
  const ctx = use(CommentsReplySlotContext)
  if (ctx === null) {
    throw new Error(`<${component}> must be rendered inside <Comments>`)
  }
  return ctx
}

export function useCommentsActions(component: string): CommentsActionsContextValue {
  const ctx = use(CommentsActionsContext)
  if (ctx === null) {
    throw new Error(`<${component}> must be rendered inside <Comments>`)
  }
  return ctx
}
