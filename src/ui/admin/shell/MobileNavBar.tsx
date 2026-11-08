import { EllipsisIcon, NotebookPenIcon, TrendingUpIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router'

import type { AdminShellProps } from '@/ui/admin/shell/AdminShell'

import { hasAtLeast } from '@/shared/utils/roles'
import { useIsActiveLink } from '@/ui/admin/shell/use-is-active-link'
import { useSidebar } from '@/ui/components/sidebar'
import { cn } from '@/ui/lib/cn'
import { useI18n } from '@/ui/lib/I18nProvider'

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
  const { t } = useI18n()
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
          <MobileNavButton to="/admin/analytics" activeMatch="subpath" label={t('admin.shell.mobile.analytics')}>
            <TrendingUpIcon className="size-5" strokeWidth={1.5} />
          </MobileNavButton>
        )}

        {showAuthorItems && (
          <MobileNavButton to="/admin/posts" activeMatch="subpath" label={t('admin.shell.mobile.posts')}>
            <NotebookPenIcon className="size-5" strokeWidth={1.5} />
          </MobileNavButton>
        )}

        {showAdminItems && (
          <MobileNavButton to="/admin/security/users" activeMatch="subpath" label={t('admin.shell.mobile.users')}>
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
          aria-label={t('admin.shell.mobile.more')}
        >
          <EllipsisIcon className="size-5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
