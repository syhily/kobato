import type { ReactElement, ReactNode } from 'react'

import {
  CommentsActionsContext,
  CommentsIdentityContext,
  CommentsReplySlotContext,
  type CommentsActionsContextValue,
  type CommentsIdentityContextValue,
  type CommentsReplySlotContextValue,
} from '@sayaka/ui/comments/comments-context'

export interface LeafContextOverrides {
  identity?: Partial<CommentsIdentityContextValue>
  slot?: Partial<CommentsReplySlotContextValue>
  actions?: Partial<CommentsActionsContextValue>
}

export function makeLeafContext(overrides: LeafContextOverrides = {}) {
  const identity: CommentsIdentityContextValue = {
    admin: false,
    currentUserId: null,
    myComments: new Map(),
    ...overrides.identity,
  }
  const slot: CommentsReplySlotContextValue = {
    activeReplyToId: 0,
    replyForm: null,
    ...overrides.slot,
  }
  const actions: CommentsActionsContextValue = {
    onReply: () => undefined,
    onCancelReply: () => undefined,
    onEdited: () => undefined,
    onApproved: () => undefined,
    onDeleted: () => undefined,
    onDismissMyComment: () => undefined,
    dispatch: () => undefined,
    ...overrides.actions,
  }
  return function LeafContext({ children }: { children: ReactNode }): ReactElement {
    return (
      <CommentsIdentityContext value={identity}>
        <CommentsReplySlotContext value={slot}>
          <CommentsActionsContext value={actions}>{children}</CommentsActionsContext>
        </CommentsReplySlotContext>
      </CommentsIdentityContext>
    )
  }
}
