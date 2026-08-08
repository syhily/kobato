import { Outlet } from 'react-router'

import type { RouteHandle } from '@/root'

import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'
import { AdminErrorFallback } from '@/ui/admin/shell/AdminErrorFallback'
// The login / install screen shares the admin Tailwind entry (`admin.css`),
// keeping the public site's `public.css` out of this route's chunk.
import '@/styles/admin.css'

// Skips `<BaseLayout>` for this tree so the admin/login stack owns its own chrome.
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
