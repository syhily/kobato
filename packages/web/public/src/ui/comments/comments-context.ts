import type { CommentItemWire as CommentItemType } from '@kobato/contracts/comments'

import { createContext, use } from 'react'

export interface MyCommentOwnership {
  expiresAt?: number
}

export interface CommentTreeState {
  items: CommentItemType[]
  rootsLoaded: number
  rootsTotal: number
  replyToId: number
  myComments: Map<string, MyCommentOwnership>
}

export type CommentTreeAction =
  | { type: 'reset'; items: CommentItemType[]; rootsTotal: number; rootsLoaded: number }
  | { type: 'append'; items: CommentItemType[]; rootsLoaded: number }
  | { type: 'insertReply'; comment: CommentItemType; rid: number }
  | { type: 'updateComment'; comment: CommentItemType }
  | { type: 'removeComment'; id: number | string }
  | { type: 'approveComment'; id: number | string }
  | { type: 'setReplyTo'; rid: number }
  | { type: 'mergeMyComments'; comments: CommentItemType[]; expiresAt: Record<string, number> }
  | { type: 'dismissMyComment'; id: string }

export interface CommentsTreeContextValue {
  commentKey: string
  totalCount: number
  state: CommentTreeState
}

export interface CommentsIdentityContextValue {
  admin: boolean
  currentUserId: string | null
  myComments: ReadonlyMap<string, MyCommentOwnership>
}

export interface CommentsReplySlotContextValue {
  activeReplyToId: number
  replyForm: React.ReactNode
}

export interface CommentsActionsContextValue {
  onReply: (rid: number) => void
  onCancelReply: () => void
  onEdited: (comment: CommentItemType) => void
  onApproved: (id: number | string) => void
  onDeleted: (id: number | string) => void
  onDismissMyComment: (id: number | string) => void
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
