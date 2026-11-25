import type { HeaderCurrentUser } from '@kobato/web-public/ui/chrome/Header'

import { avatarImageUrl } from '@kobato/assets/avatar'
import { Avatar, AvatarFallback, AvatarImage } from '@kobato/ui/components/avatar'
import { Button } from '@kobato/ui/components/button'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { type MouseEvent, Suspense, lazy, useState } from 'react'
const UserMenu = lazy(() =>
  import('@kobato/web-public/ui/chrome/UserMenu').then((module) => ({ default: module.UserMenu })),
)

export const warmUserMenuChunk = () => void import('@kobato/web-public/ui/chrome/UserMenu')

interface LazyUserMenuProps {
  currentUser: HeaderCurrentUser
  logoutRedirectTo: string
  unreadCount: number | null
  onOpenNotifications: () => void
}

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
  unreadCount: number | null
  onClick?: (event: MouseEvent) => void
}

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
