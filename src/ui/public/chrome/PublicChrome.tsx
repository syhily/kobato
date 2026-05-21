import type { ReactNode } from 'react'

import type { NavigationItem } from '@/shared/config/blog'
import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { BaseLayout } from '@/ui/public/chrome/BaseLayout'
// `public.css` is the public site's complete cascade (Bootstrap reboot/grid/
// utilities, hand-written component partials — two colocated next to their
// consumer (`@/ui/post/post.css`, `@/ui/post/toc/toc.css`) — and Tailwind v4
// with the `` prefix).
// It lives on this wrapper — and ONLY
// on this wrapper — so two contracts hold simultaneously:
//
//   1. The public site reaches `PublicChrome` through a static import from
//      `routes/public/layout.tsx`. React Router can therefore include the
//      compiled `public.css` chunk in `<Links />` during SSR, eliminating
//      the FOUC that occurs when stylesheets ride a `React.lazy()` chunk.
//
//   2. The admin SPA never touches this file (its layout imports
//      `tailwind.css` directly), so the admin chunk stays Bootstrap-free.
//      The login / install split-screen also imports `tailwind.css`
//      through `routes/auth/layout.tsx`, sharing admin tokens without
//      pulling in this public cascade.
//
// IMPORTANT: do not re-export `PublicChrome` (or any binding from this
// module) from `@/root` or `@/ui/public/chrome/BaseLayout`. A re-export
// statically pins the module — the live binding must be observable —
// which would drag `public.css` into the admin chunk and break the
// cascade contract documented in `tailwind.css` (the un-layered
// `button { padding: 0; border: none }` rule from `reset.css` would
// then beat the layered `px-5` / `border` utilities, stripping
// all padding from shadcn buttons; see #admin-buttons-no-padding).
import '@/assets/styles/public.css'

export interface PublicChromeProps {
  navigation?: NavigationItem[]
  footer?: boolean
  /**
   * Authenticated user (or `null`). The header's user menu derives the
   * "admin only" branches (e.g. "管理后台" link) from `currentUser.role`.
   */
  currentUser: HeaderCurrentUser | null
  pathname: string
  search: string
  children?: ReactNode
}

// Thin wrapper that owns the public-site stylesheet cascade and renders the
// shared `<BaseLayout>` chrome. Public routes mount this through
// `routes/public/layout.tsx`; the root `ErrorBoundary` lazy-loads it so the
// admin SPA chunk never statically depends on `public.css`.
export function PublicChrome({ navigation, footer, currentUser, pathname, search, children }: PublicChromeProps) {
  return (
    <BaseLayout navigation={navigation} footer={footer} currentUser={currentUser} pathname={pathname} search={search}>
      {children}
    </BaseLayout>
  )
}
