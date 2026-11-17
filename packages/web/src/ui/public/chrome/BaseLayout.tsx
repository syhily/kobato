import type { NavigationItem } from '@kobato/settings/types.ts'
import type { HeaderCurrentUser } from '@kobato/web/ui/public/chrome/Header.tsx'
import type { ReactNode } from 'react'

import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { useNavigationSettings } from '@kobato/web/client/settings/blog-settings-context.tsx'
import { Footer } from '@kobato/web/ui/public/chrome/Footer.tsx'
import { Header } from '@kobato/web/ui/public/chrome/Header.tsx'
import { LazyUserMenu } from '@kobato/web/ui/public/chrome/LazyUserMenu.tsx'
import { ScrollTopButton } from '@kobato/web/ui/public/chrome/ScrollTopButton.tsx'
import { ThemeToggle } from '@kobato/web/ui/public/chrome/ThemeToggle.tsx'
import { LazyNotificationsDrawer } from '@kobato/web/ui/shared/notifications/LazyNotificationsDrawer.tsx'
import { useUnreadNotificationCount } from '@kobato/web/ui/shared/notifications/use-notifications.ts'
import { useState } from 'react'
import '@kobato/web/styles/public.css'

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
  const logoutRedirectTo = `${pathname}${search}`
  // The public shell's one notification owner: both UserMenus (desktop rail + mobile brand
  // bar, always co-mounted) open this drawer and read this count. Interval refetches are
  // per-observer and do not dedupe, so a second subscription would double the polling.
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { t } = useI18n()
  const unreadCount = useUnreadNotificationCount(currentUser !== null)
  const openNotifications = () => setNotificationsOpen(true)

  return (
    <div className="flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-modal focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background focus:shadow-lg"
      >
        {t('public.chrome.skipToContent')}
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
        // Above the detail-page cover image (z-aside-drawer, 1020) so the avatar stays reachable.
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
