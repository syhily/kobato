import { use, type ReactNode } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/types/comments'

import { cn } from '@/ui/lib/cn'
import {
  CommentsActionsContext,
  CommentsStateContext,
  type CommentsActionsContextValue,
  type CommentsStateContextValue,
} from '@/ui/public/comments/comments-context'

export interface LeafContext {
  admin: boolean
  myCommentIds: Set<string>
  myCommentExpiresAt: Map<string, number>
  currentUserId: string | null
  activeReplyToId: number
  replyForm: ReactNode
  onReply: (rid: number) => void
  onEdited: (comment: CommentItemType) => void
  onApproved: (id: bigint | string) => void
  onDeleted: (id: bigint | string) => void
  onDismissMyComment: (id: bigint | string) => void
}

function noop() {
  /* noop */
}

export function useCommentsLeafContext(propMode: 'admin' | 'public' | undefined): LeafContext {
  const state = use(CommentsStateContext)
  const actions = use(CommentsActionsContext)
  if (state !== null && actions !== null) {
    return adapt(state, actions)
  }
  return {
    admin: propMode === 'admin',
    myCommentIds: new Set(),
    myCommentExpiresAt: new Map(),
    currentUserId: null,
    activeReplyToId: 0,
    replyForm: null,
    onReply: noop,
    onEdited: noop,
    onApproved: noop,
    onDeleted: noop,
    onDismissMyComment: noop,
  }
}

function adapt(state: CommentsStateContextValue, actions: CommentsActionsContextValue): LeafContext {
  return {
    admin: state.admin,
    myCommentIds: state.myCommentIds,
    myCommentExpiresAt: state.myCommentExpiresAt,
    currentUserId: state.currentUserId,
    activeReplyToId: state.activeReplyToId,
    replyForm: state.replyForm,
    onReply: actions.onReply,
    onEdited: actions.onEdited,
    onApproved: actions.onApproved,
    onDeleted: actions.onDeleted,
    onDismissMyComment: actions.onDismissMyComment,
  }
}

export function asKey(value: bigint | string | number): string {
  return String(value)
}

export const childrenListClass = cn(
  'mt-5 ml-14 p-6',
  'rounded-sm bg-surface text-sm',
  'max-md:mt-4 max-md:ml-9.5 max-md:p-4',
)

export function rootCommentLiClass(): string {
  return cn(
    'relative',
    'mb-6 pb-6 max-md:mb-4 max-md:pb-4',
    'border-b border-line',
    'last:mb-0 last:border-b-0 last:pb-0',
  )
}

export function nestedCommentLiClass(): string {
  return cn('relative', 'mb-4 pb-0', 'border-b-0', 'last:mb-0')
}

export const commentBodyClass = cn('comment-body', 'relative box-border flex max-w-full min-w-0 flex-1')

export const commentAuthorClass = cn('inline-flex max-w-full flex-wrap items-center gap-1.5', 'font-bold')

export function commentAvatarClass(depth: number): string {
  return cn(
    'relative flex shrink-0 items-center justify-center',
    'rounded-full leading-none font-semibold whitespace-nowrap',
    depth === 1 ? 'mr-[15px] size-10 max-md:mr-2.5 max-md:size-7' : 'mr-[15px] size-[30px] max-md:mr-2.5 max-md:size-7',
  )
}

export const commentInnerClass = cn('min-w-0 flex-1')

export function nestedCommentInnerClass(): string {
  return cn(commentInnerClass, 'mt-1 max-md:mt-0.5')
}

export function commentContentClass(depth: number): string {
  const base = cn('comment-content', 'prose-blog prose prose-sm max-w-none', 'wrap-break-word whitespace-normal')
  return depth === 1 ? cn(base, 'my-2 leading-[1.85]') : cn(base, 'my-1.5 break-all max-md:my-1.25')
}

export const commentFooterButtonClass = cn(
  'bg-transparent',
  'transition-[color,background-color,border-color] duration-300 ease-linear',
)

export function editableHint(expiresAt: number | undefined, isPending: boolean | undefined): string {
  if (expiresAt === undefined) {
    return isPending ? '此消息正在等待审核，可编辑。' : '可编辑此消息。'
  }
  const remainingMs = expiresAt - Date.now()
  if (remainingMs <= 0) {
    return isPending ? '此消息正在等待审核，编辑时间已过期。' : '编辑时间已过期。'
  }
  const remainingMinutes = Math.ceil(remainingMs / (60 * 1000))
  if (remainingMinutes >= 60) {
    const hours = Math.floor(remainingMinutes / 60)
    const mins = remainingMinutes % 60
    const timeStr = mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`
    return isPending ? `此消息正在等待审核，${timeStr}内可编辑。` : `${timeStr}内可编辑此消息。`
  }
  if (remainingMinutes <= 1) {
    const seconds = Math.ceil(remainingMs / 1000)
    return isPending ? `此消息正在等待审核，${seconds} 秒内可编辑。` : `${seconds} 秒内可编辑此消息。`
  }
  return isPending
    ? `此消息正在等待审核，${remainingMinutes} 分钟内可编辑。`
    : `${remainingMinutes} 分钟内可编辑此消息。`
}
