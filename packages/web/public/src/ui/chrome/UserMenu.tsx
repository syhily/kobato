import type { HeaderCurrentUser } from '@kobato/web-public/ui/chrome/Header.tsx'

import { avatarImageUrl } from '@kobato/assets/avatar.ts'
import { ROLE_LABEL_KEYS } from '@kobato/auth/roles.ts'
import { Avatar, AvatarFallback, AvatarImage } from '@kobato/ui/components/avatar.tsx'
import { Button } from '@kobato/ui/components/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kobato/ui/components/dropdown-menu.tsx'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useLogout } from '@kobato/web-public/ui/shared/auth/use-logout.ts'
import { warmNotificationsDrawerChunk } from '@kobato/web-public/ui/shared/notifications/LazyNotificationsDrawer.tsx'
import { NotificationBadge } from '@kobato/web-public/ui/shared/notifications/NotificationBadge.tsx'
import { BellIcon, LogOutIcon, MessageSquareIcon, MonitorIcon, SettingsIcon, UserIcon } from 'lucide-react'
import { Link } from 'react-router'

interface Props {
  currentUser: HeaderCurrentUser
  logoutRedirectTo: string
  /** Owned by BaseLayout (the public shell's one subscriber) — never re-subscribe here.
   *  `null` = unknown (not loaded / failed), distinct from a confirmed `0`. */
  unreadCount: number | null
  onOpenNotifications: () => void
  /** Mount with the menu open — set by LazyUserMenu when the activating click
   *  already happened on its placeholder trigger. */
  defaultOpen?: boolean
}

// Public chrome's user menu. Reaches the browser only through LazyUserMenu's
// interaction-gated lazy chunk — never import it statically from the public chrome.
export function UserMenu({
  currentUser,
  logoutRedirectTo,
  unreadCount,
  onOpenNotifications,
  defaultOpen = false,
}: Props) {
  const logout = useLogout()
  const { t } = useI18n()
  const initial = (currentUser.name || '?').slice(0, 1).toUpperCase()
  const canEnterAdmin = currentUser.role === 'admin' || currentUser.role === 'author'
  // An unknown count renders like zero: no dot, no badge, plain aria label.
  const badgeCount = unreadCount ?? 0
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-9 rounded-full"
            aria-label={
              badgeCount > 0 ? t('public.chrome.userMenuUnread', { count: badgeCount }) : t('public.chrome.userMenu')
            }
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
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{currentUser.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{t(ROLE_LABEL_KEYS[currentUser.role])}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onOpenNotifications()} onPointerEnter={warmNotificationsDrawerChunk}>
          <BellIcon /> {t('public.chrome.notifications')}
          <NotificationBadge count={badgeCount} className="px-1.5 text-[11px] leading-none" />
        </DropdownMenuItem>
        <DropdownMenuItem
          render={
            <Link to="/admin/me/comments" prefetch="intent">
              <MessageSquareIcon /> {t('public.chrome.myComments')}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link to="/admin/me/sessions" prefetch="intent">
              <MonitorIcon /> {t('public.chrome.mySessions')}
            </Link>
          }
        />
        <DropdownMenuItem
          render={
            <Link to="/admin/me/profile" prefetch="intent">
              <UserIcon /> {t('public.chrome.profile')}
            </Link>
          }
        />
        {canEnterAdmin && (
          <DropdownMenuItem
            render={
              <Link to="/admin/" prefetch="intent">
                <SettingsIcon /> {t('public.chrome.admin')}
              </Link>
            }
          />
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout(logoutRedirectTo)}>
          <LogOutIcon /> {t('public.chrome.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
