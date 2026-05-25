import { Outlet } from 'react-router'

import type { RouteHandle } from '@/root'

import { useDetachPublicCss } from '@/client/hooks/use-detach-public-css'
import { AdminErrorFallback } from '@/ui/admin/shell/AdminErrorFallback'
// The login / install screen is admin chrome — same shadcn / Tailwind v4
// cascade the admin SPA uses, so import `tailwind.css` directly. This
// keeps the public-site Bootstrap cascade (`public.css`) and the
// historical `admin.css` Bootstrap split-screen rules out of this route's
// chunk, matching the project's "admin pages do not load public.css"
// contract.
import '@/styles/admin.css'

// Tells `root.tsx` to skip rendering `<BaseLayout>` for any descendant route
// so the admin / login stack can own its own chrome.
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
