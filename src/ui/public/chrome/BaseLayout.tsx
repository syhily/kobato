import type { ReactNode } from 'react'

import { useState } from 'react'

import type { NavigationItem } from '@/shared/config/types'
import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { useUnreadNotificationCount } from '@/client/hooks/use-notifications'
import { useNavigationSettings } from '@/shared/lib/blog-config-context'
import { Footer } from '@/ui/public/chrome/Footer'
import { Header } from '@/ui/public/chrome/Header'
import { LazyUserMenu } from '@/ui/public/chrome/LazyUserMenu'
import { ScrollTopButton } from '@/ui/public/chrome/ScrollTopButton'
import { ThemeToggle } from '@/ui/public/chrome/ThemeToggle'
import { LazyNotificationsDrawer } from '@/ui/shared/notifications/LazyNotificationsDrawer'
// Static import so React Router preloads `public.css` during SSR (no FOUC).
// Do NOT re-export from `@/root` — that would pin this module in the admin chunk.
import '@/styles/public.css'

export interface BaseLayoutProps {
  navigation?: NavigationItem[]
  footer?: boolean
  currentUser: HeaderCurrentUser | null
  pathname: string
  search: string
  children?: ReactNode
}

export function BaseLayout({ navigation, footer, currentUser, pathname, search, children }: BaseLayoutProps) {
  const navigationSection = useNavigationSettings()
  const showFooter = footer !== undefined ? footer : true
  const resolvedNavigation = navigation || navigationSection.navigation.sideNav
  // Logout returns to the page the user signed out from.
  const logoutRedirectTo = `${pathname}${search}`
  // The public shell's ONE notification owner: both UserMenus (desktop rail +
  // mobile brand bar, always co-mounted) open this drawer and read this count.
  // Interval refetches are per-observer and do not dedupe (ADR-0009).
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unreadCount = useUnreadNotificationCount(currentUser !== null)
  const openNotifications = () => setNotificationsOpen(true)

  return (
    <div className="flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-modal focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background focus:shadow-lg"
      >
        跳转到主要内容
      </a>
      <Header
        navigation={resolvedNavigation}
        currentUser={currentUser}
        pathname={pathname}
        logoutRedirectTo={logoutRedirectTo}
        unreadCount={unreadCount}
        onOpenNotifications={openNotifications}
      />
      {currentUser && (
        // Above the detail-page cover image (z-aside-drawer / 1020) so the avatar and dropdown stay reachable.
        <div className="fixed top-4 right-4 z-modal hidden lg:block">
          <LazyUserMenu
            currentUser={currentUser}
            logoutRedirectTo={logoutRedirectTo}
            unreadCount={unreadCount}
            onOpenNotifications={openNotifications}
          />
        </div>
      )}
      <main id="main-content" className="flex min-w-0 flex-1 flex-col">
        {children}
        {showFooter && <Footer />}
      </main>
      <ul className="fixed right-5 bottom-5 z-9999 flex transform-gpu flex-col gap-2">
        <ScrollTopButton />
        <li className="lg:hidden">
          <ThemeToggle mode="public" variant="floating" />
        </li>
      </ul>
      {currentUser ? (
        <LazyNotificationsDrawer
          open={notificationsOpen}
          onOpenChange={setNotificationsOpen}
          isAdmin={currentUser.role === 'admin'}
          unreadCount={unreadCount}
        />
      ) : null}
    </div>
  )
}
