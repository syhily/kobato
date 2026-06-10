import { createContext, use } from 'react'

import type { CommentFormUser } from '@/shared/types/catalog'
import type { CommentItemWire as CommentItemType } from '@/shared/types/comments'

export interface CommentTreeState {
  items: CommentItemType[]
  rootsLoaded: number
  rootsTotal: number
  replyToId: number
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

export interface CommentsStateContextValue {
  commentKey: string
  totalCount: number
  admin: boolean
  user?: CommentFormUser
  state: CommentTreeState
  activeReplyToId: number
  myCommentIds: Set<string>
  myCommentExpiresAt: Map<string, number>
  currentUserId: string | null
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

export const CommentsStateContext = createContext<CommentsStateContextValue | null>(null)
export const CommentsActionsContext = createContext<CommentsActionsContextValue | null>(null)

export function useCommentsState(component: string): CommentsStateContextValue {
  const ctx = use(CommentsStateContext)
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
