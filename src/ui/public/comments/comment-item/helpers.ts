import type { AppLocale } from '@/shared/i18n/locales'
import type { I18nValue } from '@/ui/lib/I18nProvider'

import { formatDuration } from '@/shared/i18n/format'
import { cn } from '@/ui/lib/cn'

export function asKey(value: number | string): string {
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
  const base = cn('comment-content', 'typeset typeset-comment', 'wrap-break-word whitespace-normal')
  return depth === 1 ? cn(base, 'my-2 leading-copy') : cn(base, 'my-1.5 break-all max-md:my-1.25')
}

export const commentFooterButtonClass = cn(
  'bg-transparent',
  'transition-[color,background-color,border-color] duration-300 ease-linear',
)

export function editableHint(
  expiresAt: number | undefined,
  isPending: boolean | undefined,
  t: I18nValue['t'],
  locale: AppLocale,
): string {
  if (expiresAt === undefined) {
    return isPending ? t('public.comments.editablePending') : t('public.comments.editable')
  }
  // `Date.now()` is safe here: ownership only populates post-mount, so this hint never
  // renders during SSR/hydration.
  const remainingMs = expiresAt - Date.now()
  if (remainingMs <= 0) {
    return isPending ? t('public.comments.editExpiredPending') : t('public.comments.editExpired')
  }
  const duration = formatDuration(remainingMs, { locale })
  return isPending
    ? t('public.comments.editableForPending', { duration })
    : t('public.comments.editableFor', { duration })
}
