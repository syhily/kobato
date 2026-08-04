import { useDetachPublicCss } from '@kobato/client/hooks/use-detach-public-css'
import { AdminErrorFallback } from '@kobato/ui/admin/shell/AdminErrorFallback'
import { Outlet } from 'react-router'

import type { RouteHandle } from '@/root'

// The login / install screen uses the same shadcn / Tailwind v4 cascade
// as the admin SPA. Importing `tailwind.css` directly keeps the public
// site's `public.css` out of this route's chunk.
import '@/styles/admin.css'

// Tells `root.tsx` to skip rendering `<BaseLayout>` for any descendant
// route so the admin / login stack can own its own chrome.
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
