import { EllipsisIcon, NotebookPenIcon, TrendingUpIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { useIsActiveLink } from '@/ui/admin/shell/use-is-active-link'
import { useSidebar } from '@/ui/components/sidebar'
import { cn } from '@/ui/lib/cn'

interface MobileNavButtonProps {
  to: string
  activeMatch?: 'exact' | 'subpath'
  children: React.ReactNode
  label: string
}

function MobileNavButton({ to, activeMatch = 'exact', children, label }: MobileNavButtonProps) {
  const isActive = useIsActiveLink(to, activeMatch === 'subpath')

  return (
    <Link
      to={to}
      prefetch="intent"
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 text-xs font-medium transition-colors',
        isActive ? 'text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground',
      )}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </Link>
  )
}

export function MobileNavBar({ role }: { role: AdminShellProps['currentUser']['role'] }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar()

  if (!isMobile) {
    return null
  }

  const showAuthorItems = hasAtLeast(role, 'author')
  const showAdminItems = hasAtLeast(role, 'admin')

  return (
    <div
      className={cn(
        'fixed right-0 bottom-0 left-0 z-50 bg-sidebar/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden',
      )}
    >
      <div
        className={cn(
          'mx-auto grid h-14 w-full max-w-[var(--container-popup-sm)] items-center justify-items-center px-5',
          showAdminItems ? 'grid-cols-4' : showAuthorItems ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {showAdminItems && (
          <MobileNavButton to="/admin/analytics" activeMatch="subpath" label="统计">
            <TrendingUpIcon className="size-5" strokeWidth={1.5} />
          </MobileNavButton>
        )}

        {showAuthorItems && (
          <MobileNavButton to="/admin/posts" activeMatch="subpath" label="文章">
            <NotebookPenIcon className="size-5" strokeWidth={1.5} />
          </MobileNavButton>
        )}

        {showAdminItems && (
          <MobileNavButton to="/admin/security/users" activeMatch="subpath" label="用户">
            <UsersIcon className="size-5" strokeWidth={1.5} />
          </MobileNavButton>
        )}

        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          aria-expanded={openMobile}
          aria-controls="app-sidebar"
          className={cn(
            'flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 text-xs font-medium transition-colors',
            'text-sidebar-foreground/60 hover:text-sidebar-foreground',
          )}
          aria-label="更多"
        >
          <EllipsisIcon className="size-5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
