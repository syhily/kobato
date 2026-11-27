import type { NavigationItem } from '@kobato/settings/types'
import type { HeaderCurrentUser } from '@sayaka/ui/chrome/Header'
import type { ReactNode } from 'react'

import { useNavigationSettings } from '@kobato/ui/lib/blog-settings-context'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { LazyNotificationsDrawer } from '@kobato/web-kit/ui/shared/notifications/LazyNotificationsDrawer'
import { useUnreadNotificationCount } from '@kobato/web-kit/ui/shared/notifications/use-notifications'
import { Footer } from '@sayaka/ui/chrome/Footer'
import { Header } from '@sayaka/ui/chrome/Header'
import { LazyUserMenu } from '@sayaka/ui/chrome/LazyUserMenu'
import { ScrollTopButton } from '@sayaka/ui/chrome/ScrollTopButton'
import { ThemeToggle } from '@sayaka/ui/chrome/ThemeToggle'
import { useState } from 'react'

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
