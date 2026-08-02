import { createContext, type ReactNode, use, useEffect, useMemo, useRef, useState } from 'react'

import { AdminMusicPlayerBar } from '@/ui/admin/musics/AdminMusicPlayerBar'
import { AdminMusicPlayerFloat } from '@/ui/admin/musics/AdminMusicPlayerFloat'
import { MusicPlayerProvider } from '@/ui/admin/musics/MusicPlayerContext'
import { AdminScrollTopButton } from '@/ui/admin/shell/AdminScrollTopButton'
import { AppSidebar } from '@/ui/admin/shell/AppSidebar'
import { MobileNavBar } from '@/ui/admin/shell/MobileNavBar'
import { SidebarInset, SidebarProvider } from '@/ui/components/sidebar'
import { Toaster } from '@/ui/components/sonner'
import { cn } from '@/ui/lib/cn'

interface AdminChromeContextValue {
  focused: boolean
  setFocused: (next: boolean) => void
  scrollTopLifted: boolean
  setScrollTopLifted: (next: boolean) => void
}

const AdminChromeContext = createContext<AdminChromeContextValue | null>(null)

const NOOP_CHROME: AdminChromeContextValue = {
  focused: false,
  setFocused: () => {
    /* noop */
  },
  scrollTopLifted: false,
  setScrollTopLifted: () => {
    /* noop */
  },
}

export function useAdminChrome(): AdminChromeContextValue {
  const ctx = use(AdminChromeContext)
  return ctx ?? NOOP_CHROME
}

/**
 * Convenience hook used by routes that want to enter focus mode for
 * the duration of a UI state. Pass `true` to collapse the chrome,
 * `false` to restore it. The unmount cleanup always restores so
 * routes that forget to flip the flag back don't leak focus mode
 * into the next navigation.
 */
export function useAdminChromeFocus(active: boolean): void {
  const { setFocused } = useAdminChrome()
  useEffect(() => {
    setFocused(active)
    return () => setFocused(false)
  }, [active, setFocused])
}

/**
 * Signals to the admin shell that the current route mounts a
 * bottom-right FAB (e.g. the editor's publish button), so the shared
 * `AdminScrollTopButton` should ride above its default slot to keep
 * both FABs reachable.
 */
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
  mainScrollRef: React.RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <main id="admin-main-content" ref={mainScrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
      <div
        className={cn(
          focused && 'flex min-h-0 flex-1 flex-col',
          focused ? 'w-full p-2 lg:p-4' : 'mx-auto w-full max-w-(--container-admin) p-4 lg:p-6',
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
            跳转到主要内容
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
              <MobileNavBar />
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
