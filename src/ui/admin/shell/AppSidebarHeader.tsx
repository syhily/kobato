import { SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'

import { brandingVersion } from '@/shared/config/utils'
import { useAssetsSettingsOptional } from '@/shared/lib/blog-config-context'
import { SearchShortcutHint } from '@/ui/admin/shared/SearchShortcutHint'
import { AdminSearchDialog } from '@/ui/admin/shell/AdminSearchDialog'
import { SidebarHeader } from '@/ui/components/sidebar'

interface AppSidebarHeaderProps {
  className?: string
  siteTitle?: string
}

export function AppSidebarHeader({ className, siteTitle }: AppSidebarHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const isSettingsPage = location.pathname.startsWith('/admin/settings')
  const assets = useAssetsSettingsOptional()
  const qs = brandingVersion(assets?.branding)
  const v = qs ? `?v=${qs}` : ''

  // Global ⌘K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // Defer to the settings search input on the settings page.
        if (isSettingsPage) {
          return
        }
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsPage])

  return (
    <SidebarHeader className={className}>
      <div className="flex flex-col items-stretch gap-6">
        {/* Site branding */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-8 shrink-0 rounded-xl">
              <img src={`/logo.svg${v}`} alt="站点图标" className="h-full w-full rounded-xl object-cover dark:hidden" />
              <img
                src={`/logo-dark.svg${v}`}
                alt="站点图标"
                className="hidden h-full w-full rounded-xl object-cover dark:block"
              />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden text-md font-semibold text-ellipsis whitespace-nowrap text-foreground">
              {siteTitle ?? '管理后台'}
            </div>
          </div>
        </div>

        {/* Global search trigger */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-expanded={searchOpen}
          aria-haspopup="dialog"
          className="flex h-search-trigger items-center justify-between rounded-xl border border-sidebar-border bg-background pr-3 pl-4 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground hover:shadow-sm"
        >
          <div className="flex items-center gap-2">
            <SearchIcon className="size-4" />
            全站搜索
          </div>
          <SearchShortcutHint />
        </button>
      </div>

      <AdminSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarHeader>
  )
}
