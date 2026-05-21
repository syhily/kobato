import { use, type ReactNode } from 'react'

import type { CommentItemWire as CommentItemType } from '@/shared/contracts/comments'

import { cn } from '@/ui/lib/cn'
import { CommentsContext, type CommentsContextValue } from '@/ui/public/comments/comments-context'

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

// Read-only consumer that returns sensible defaults when no `<Comments>`
// orchestrator is present (test snapshots and the legacy `<Comment>` SSR
// helper). Compound usage is unaffected — the orchestrator always provides
// the full context value, so leaf components see real callbacks there.
export function useCommentsLeafContext(propAdmin: boolean | undefined): LeafContext {
  const ctx = use(CommentsContext)
  if (ctx !== null) {
    return adapt(ctx)
  }
  return {
    admin: propAdmin === true,
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

function adapt(ctx: CommentsContextValue): LeafContext {
  // When a CommentsContext is mounted, it is the single source of truth.
  // The legacy `<Comment>` SSR helper and snapshot tests still pass an
  // `admin` prop, but those paths render WITHOUT a provider and fall
  // through the fallback above instead of landing here. So inside a
  // compound usage we always read from context — no more prop-vs-context
  // drift surface.
  return {
    admin: ctx.admin,
    myCommentIds: ctx.myCommentIds,
    myCommentExpiresAt: ctx.myCommentExpiresAt,
    currentUserId: ctx.currentUserId,
    activeReplyToId: ctx.activeReplyToId,
    replyForm: ctx.replyForm,
    onReply: ctx.onReply,
    onEdited: ctx.onEdited,
    onApproved: ctx.onApproved,
    onDeleted: ctx.onDeleted,
    onDismissMyComment: ctx.onDismissMyComment,
  }
}

export function asKey(value: bigint | string | number): string {
  return String(value)
}

// Nested-replies wrapper. The legacy `.children` rule lived in
// `comments.css`. Preflight (`@layer base`) zeros out `<ul>`
// margin/padding/list-style; Tailwind utilities live in `@layer
// utilities`, which beats `@layer base` per the W3C cascade-layers
// spec — so the spacing utilities below do NOT need `!important` to
// win against the Preflight reset (Stage 11 P2). The default-vs-
// mobile margin/padding pair is preserved in two `max-md:` overrides
// instead of the legacy media query.
export const childrenListClass = cn(
  'mt-5 ml-14 p-6',
  'rounded-sm bg-surface text-sm',
  'max-md:mt-4 max-md:ml-9.5 max-md:p-4',
)

// `<li>` is hit by Preflight (`@layer base`), but Tailwind utilities
// land in `@layer utilities` and beat `@layer base` regardless of
// selector specificity.
//
// depth === 1 keeps the full root chrome (1.5rem mb/pb + bottom
// border collapse on last child); depth > 1 runs inside the nested
// `<ul>` and the legacy override drops to `1rem` margin and removes
// the divider.
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

// `<article>` is not in reset.css, so the `display: flex`/min-width:0
// chain travels without `important`. The `comment-body` literal is a
// hook for `useFocusHash` which adds `.active` when the URL hash
// targets this comment (`#user-comment-<id>`) so the flash animation
// in `public.css` can replay.
export const commentBodyClass = cn('comment-body', 'relative box-border flex max-w-full min-w-0 flex-1')

export const commentAuthorClass = cn('inline-flex max-w-full flex-wrap items-center gap-1.5', 'font-bold')

// Depth-aware avatar size + right margin. Default = 40 px square with
// 15 px right margin (root rows on >=768 px). Mobile (<768 px) drops to
// 28×28 + 10 px. Nested rows always render at 30×30 on >=768 px and
// fall to 28×28 on mobile.
export function commentAvatarClass(depth: number): string {
  return cn(
    'relative flex shrink-0 items-center justify-center',
    'rounded-full leading-none font-semibold whitespace-nowrap',
    depth === 1 ? 'mr-[15px] size-10 max-md:mr-2.5 max-md:size-7' : 'mr-[15px] size-[30px] max-md:mr-2.5 max-md:size-7',
  )
}

export const commentInnerClass = cn('min-w-0 flex-1')

// Mobile overrides on `.comment-inner` (`margin: 0.125rem 0 0`) and
// the nested `.comment-inner` (`margin: 0.25rem 0 0`) historically
// shifted the inner column down by 2-4 px to align with the avatar
// baseline. Inline that on the same node so the cascade is local.
export function nestedCommentInnerClass(): string {
  return cn(commentInnerClass, 'mt-1 max-md:mt-0.5')
}

// Root rows had `margin: 0.5rem 0` + `line-height: 1.85`; nested rows
// tightened to `0.375rem` (default) and `0.3125rem` (<=767 px). The
// `comment-content` literal stays on the element because the
// `@utility prose-blog { &.comment-content {…} }` nested compound in
// `tailwind.css` targets it for code-block typography fine-tuning.
export function commentContentClass(depth: number): string {
  const base = cn('comment-content', 'prose-blog prose prose-sm max-w-none', 'wrap-break-word whitespace-normal')
  return depth === 1 ? cn(base, 'my-2 leading-[1.85]') : cn(base, 'my-1.5 break-all max-md:my-1.25')
}

// Shared base for every `<button>` inside the comment footer. The
// legacy footer-button rule used `transition: all 0.3s linear`; keep
// the 300ms / linear timing exactly so hover/focus states animate at
// the same pace as before. We narrow `all` to `color, background-
// color, border-color` (the only properties that can change here) so
// future `transform`/`opacity` tweaks don't get ridden by a 300ms
// ramp. `bg-transparent` is preserved because reset.css normalizes
// `<button>` to a UA default that varies between engines.
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
