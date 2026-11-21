import { AdminErrorFallback } from '@kobato/web-admin/ui/shell/AdminErrorFallback'
import { useDetachPublicCss } from '@kobato/web-client/hooks/use-detach-public-css'
import { Outlet } from 'react-router'

import type { RouteHandle } from '@/root'

import '@/styles/admin.css'

export const handle: RouteHandle = { layout: 'admin' }

export { AdminErrorFallback as ErrorBoundary }

export default function AdminLayoutRoute() {
  useDetachPublicCss()

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-muted/40 via-background to-background text-foreground">
      <div className="flex flex-1 flex-shrink-0 items-center justify-center px-[5%] pb-[8vh]">
        <main className="w-full max-w-[520px] py-12">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
