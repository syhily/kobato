import type { ReactNode } from 'react'

import type { NavigationItem } from '@/shared/config/types'
import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { useNavigationSettings } from '@/shared/lib/blog-config-context'
import { Footer } from '@/ui/public/chrome/Footer'
import { Header } from '@/ui/public/chrome/Header'
import { ScrollTopButton } from '@/ui/public/chrome/ScrollTopButton'
import { ThemeToggle } from '@/ui/public/chrome/ThemeToggle'
import { UserMenu } from '@/ui/public/chrome/UserMenu'

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
  const logoutQuery = new URLSearchParams({
    action: 'logout',
    redirect_to: `${pathname}${search}`,
  }).toString()

  return (
    <div className="flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-modal focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background focus:shadow-lg"
      >
        跳转到主要内容
      </a>
      <Header navigation={resolvedNavigation} currentUser={currentUser} pathname={pathname} search={search} />
      {currentUser && (
        // Raise above the right-side cover image used on detail pages
        // (z-aside-drawer / 1020) so the avatar and its dropdown stay reachable.
        <div className="fixed top-4 right-4 z-modal hidden lg:block">
          <UserMenu currentUser={currentUser} logoutQuery={logoutQuery} />
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
    </div>
  )
}
