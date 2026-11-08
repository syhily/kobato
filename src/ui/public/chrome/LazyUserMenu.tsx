import { Suspense, lazy, useState } from 'react'

import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { avatarImageUrl } from '@/shared/utils/avatar'
import { Avatar, AvatarFallback, AvatarImage } from '@/ui/components/avatar'
import { Button } from '@/ui/components/button'
import { useI18n } from '@/ui/lib/I18nProvider'

// The dropdown chrome (Base UI menu, logout, notification entries) rides a
// lazy chunk so anonymous visitors never download logged-in-only JS. The
// trigger below is the static half: SSR renders it for every logged-in
// visitor, byte-stable across SSR and hydration, and the first click swaps
// it for the real UserMenu with the menu already open. Anonymous visitors
// render neither the trigger nor the chunk (BaseLayout/Header gate on
// `currentUser`). Parity with UserMenu's trigger subtree is pinned by
// tests/unit/ui/public/chrome/lazy-user-menu.test.tsx.
const UserMenu = lazy(() => import('@/ui/public/chrome/UserMenu').then((module) => ({ default: module.UserMenu })))

// Hover-intent prefetch; the browser dedupes this against the lazy boundary's own import.
export const warmUserMenuChunk = () => void import('@/ui/public/chrome/UserMenu')

interface LazyUserMenuProps {
  currentUser: HeaderCurrentUser
  logoutRedirectTo: string
  /** Owned by BaseLayout (the public shell's one subscriber) — never re-subscribe here.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
  onOpenNotifications: () => void
}

// Interaction-gated mount, latching on the first click: the mounted menu
// stays mounted so its open/close state survives future toggles. Activation
// rides onClick (not pointerdown) to mirror Base UI's own open-on-click
// trigger semantics — a pointerdown-then-mount sequence would let the
// browser's follow-up click land on the REAL trigger and instantly toggle
// the just-opened menu closed. Focus needs no handoff: mounting with
// `defaultOpen` makes Base UI move DOM focus onto the popup (virtual focus)
// exactly like a native open.
export function LazyUserMenu(props: LazyUserMenuProps) {
  const [mounted, setMounted] = useState(false)

  if (!mounted) {
    return <UserMenuTrigger {...props} onClick={() => setMounted(true)} />
  }
  return (
    <Suspense fallback={<UserMenuTrigger {...props} />}>
      <UserMenu {...props} defaultOpen />
    </Suspense>
  )
}

interface UserMenuTriggerProps {
  currentUser: HeaderCurrentUser
  /** `null` = unknown — renders like zero, as in UserMenu. */
  unreadCount: number | null
  onClick?: (event: React.MouseEvent) => void
}

/** Static stand-in for UserMenu's trigger: the same avatar button (dot, ring,
 *  aria-label) without the dropdown wiring, so the swap on mount is visually
 *  invisible. `aria-expanded="false"` mirrors the closed menu that follows. */
function UserMenuTrigger({ currentUser, unreadCount, onClick }: UserMenuTriggerProps) {
  const { t } = useI18n()
  const initial = (currentUser.name || '?').slice(0, 1).toUpperCase()
  const badgeCount = unreadCount ?? 0
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative size-9 rounded-full"
      aria-label={
        badgeCount > 0 ? t('public.chrome.userMenuUnread', { count: badgeCount }) : t('public.chrome.userMenu')
      }
      aria-haspopup="menu"
      aria-expanded={false}
      onClick={onClick}
      onPointerEnter={warmUserMenuChunk}
      onFocus={warmUserMenuChunk}
    >
      {' '}
      <Avatar className="size-8">
        <AvatarImage src={avatarImageUrl(currentUser.id)} alt={currentUser.name} />
        <AvatarFallback>{initial}</AvatarFallback>
      </Avatar>
      {badgeCount > 0 ? (
        <span
          className="absolute top-0 right-0 size-2.5 rounded-full bg-destructive ring-2 ring-background"
          aria-hidden
        />
      ) : null}
    </Button>
  )
}
