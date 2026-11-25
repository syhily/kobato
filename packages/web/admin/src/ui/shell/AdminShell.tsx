import { SidebarInset, SidebarProvider } from '@kobato/ui/components/sidebar'
import { Toaster } from '@kobato/ui/components/sonner'
import { cn } from '@kobato/ui/lib/cn'
import { useI18n } from '@kobato/ui/lib/I18nProvider'
import { AdminMusicPlayerBar } from '@kobato/web-admin/ui/music/player/AdminMusicPlayerBar'
import { AdminMusicPlayerFloat } from '@kobato/web-admin/ui/music/player/AdminMusicPlayerFloat'
import { MusicPlayerProvider } from '@kobato/web-admin/ui/music/player/music-player-context'
import { AdminScrollTopButton } from '@kobato/web-admin/ui/shell/AdminScrollTopButton'
import { AppSidebar } from '@kobato/web-admin/ui/shell/AppSidebar'
import { MobileNavBar } from '@kobato/web-admin/ui/shell/MobileNavBar'
import { type ReactNode, type RefObject, createContext, use, useEffect, useMemo, useRef, useState } from 'react'
interface AdminChromeContextValue {
  focused: boolean
  setFocused: (next: boolean) => void
  scrollTopLifted: boolean
  setScrollTopLifted: (next: boolean) => void
}

const AdminChromeContext = createContext<AdminChromeContextValue | null>(null)

const NOOP_CHROME: AdminChromeContextValue = {
  focused: false,
  setFocused: () => undefined,
  scrollTopLifted: false,
  setScrollTopLifted: () => undefined,
}

export function useAdminChrome(): AdminChromeContextValue {
  const ctx = use(AdminChromeContext)
  return ctx ?? NOOP_CHROME
}

export function useAdminChromeFocus(active: boolean): void {
  const { setFocused } = useAdminChrome()
  useEffect(() => {
    setFocused(active)
    return () => setFocused(false)
  }, [active, setFocused])
}

export function useAdminScrollTopLift(active: boolean): void {
  const { setScrollTopLifted } = useAdminChrome()
  useEffect(() => {
    setScrollTopLifted(active)
    return () => setScrollTopLifted(false)
  }, [active, setScrollTopLifted])
}

export interface AdminShellProps {
  currentUser: {
    id: string
    name: string
    email: string
    role: 'admin' | 'author' | 'visitor' | null
  }
  siteTitle?: string
  pathname?: string
  pendingCommentCount?: number
  pendingWebmentionCount?: number
  userCount?: number
  children: ReactNode
}

function MusicPlayerAwareMain({
  focused,
  mainScrollRef,
  children,
}: {
  focused: boolean
  mainScrollRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <main id="admin-main-content" ref={mainScrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div
        className={cn(
          focused && 'flex min-h-0 flex-1 flex-col',
          focused ? 'w-full p-2 lg:p-4' : 'mx-auto w-full max-w-admin p-8 md:p-10 lg:p-12',
        )}
      >
        {children}
      </div>
    </main>
  )
}

export function AdminShell({
  currentUser,
  siteTitle,
  pendingCommentCount,
  pendingWebmentionCount,
  userCount,
  children,
}: AdminShellProps) {
  const { t } = useI18n()
  const [focused, setFocused] = useState(false)
  const [scrollTopLifted, setScrollTopLifted] = useState(false)
  const mainScrollRef = useRef<HTMLElement | null>(null)
  const chromeValue = useMemo<AdminChromeContextValue>(
    () => ({ focused, setFocused, scrollTopLifted, setScrollTopLifted }),
    [focused, scrollTopLifted],
  )

  return (
    <MusicPlayerProvider>
      <AdminChromeContext value={chromeValue}>
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          <a
            href="#admin-main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-foreground focus:px-4 focus:py-2 focus:text-background focus:shadow-lg"
          >
            {t('public.chrome.skipToContent')}
          </a>
          <SidebarProvider>
            <AppSidebar
              currentUser={currentUser}
              siteTitle={siteTitle}
              pendingCommentCount={pendingCommentCount}
              pendingWebmentionCount={pendingWebmentionCount}
              userCount={userCount}
            />
            <SidebarInset
              className={cn(
                'overflow-x-hidden',
                !focused && 'max-h-[calc(100%_-_var(--mobile-navbar-height))] md:max-h-full',
              )}
            >
              <MusicPlayerAwareMain focused={focused} mainScrollRef={mainScrollRef}>
                {children}
              </MusicPlayerAwareMain>
              <AdminMusicPlayerBar />
              <MobileNavBar role={currentUser.role} />
            </SidebarInset>
          </SidebarProvider>
          <AdminMusicPlayerFloat />
          <AdminScrollTopButton
            lifted={focused || scrollTopLifted}
            {...(focused ? { scrollRootRef: mainScrollRef } : {})}
          />
          <Toaster />
        </div>
      </AdminChromeContext>
    </MusicPlayerProvider>
  )
}
