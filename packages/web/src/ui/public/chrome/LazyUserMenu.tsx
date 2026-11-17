import type { HeaderCurrentUser } from '@kobato/web/ui/public/chrome/Header.tsx'

import { avatarImageUrl } from '@kobato/shared/utils/avatar.ts'
import { Avatar, AvatarFallback, AvatarImage } from '@kobato/ui/components/avatar.tsx'
import { Button } from '@kobato/ui/components/button.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { Suspense, lazy, useState } from 'react'

// The dropdown chrome (Base UI menu, logout, notification entries) rides a lazy chunk so
// anonymous visitors never download logged-in-only JS. The trigger below is the static half,
// byte-stable across SSR and hydration; the first click swaps it for the real UserMenu with
// the menu already open. Trigger-subtree parity with UserMenu is pinned by
// tests/unit/ui/public/chrome/lazy-user-menu.test.tsx.
const UserMenu = lazy(() =>
  import('@kobato/web/ui/public/chrome/UserMenu.tsx').then((module) => ({ default: module.UserMenu })),
)

// Hover-intent prefetch; the browser dedupes this against the lazy boundary's own import.
export const warmUserMenuChunk = () => void import('@kobato/web/ui/public/chrome/UserMenu.tsx')

interface LazyUserMenuProps {
  currentUser: HeaderCurrentUser
  logoutRedirectTo: string
  /** Owned by BaseLayout (the public shell's one subscriber) — never re-subscribe here.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
  onOpenNotifications: () => void
}

// Interaction-gated mount, latching on the first click so open/close state survives later
// toggles. Activation rides onClick, not pointerdown: a pointerdown-then-mount sequence lets
// the browser's follow-up click land on the REAL trigger and toggle the just-opened menu
// closed. No focus handoff is needed — `defaultOpen` makes Base UI move focus onto the popup.
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

/** Static stand-in for UserMenu's trigger: the same avatar button without the dropdown
 *  wiring, so the swap on mount is visually invisible. */
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
