import type { ReactNode } from 'react'

import type { NavigationItem } from '@/shared/config/blog'
import type { HeaderCurrentUser } from '@/ui/public/chrome/Header'

import { useNavigationSettings } from '@/shared/lib/blog-config-context'
import { Footer } from '@/ui/public/chrome/Footer'
import { Header } from '@/ui/public/chrome/Header'
import { ScrollTopButton } from '@/ui/public/chrome/ScrollTopButton'
import { ThemeToggle } from '@/ui/public/chrome/ThemeToggle'
import { UserMenu } from '@/ui/public/chrome/UserMenu'

// NOTE: this component does NOT import `public.css`. The public stylesheet
// cascade lives one level up in `@/ui/public/chrome/PublicChrome` so it can be
// reached through a *static* import from `routes/public/layout.tsx` (which
// in turn lets React Router include the resolved `<link rel="stylesheet">`
// tags in the SSR `<Links />` output, preventing FOUC on first paint).
//
// Importing `public.css` here would re-attach the Bootstrap reboot/grid/
// utility cascade to every consumer of `<BaseLayout>` — including the
// `<BaseLayout>` rendered by the root `ErrorBoundary`'s lazy chunk — and
// would drag those bytes into the admin SPA chunk through that lazy
// graph. Keep this file CSS-free; mount `<PublicChrome>` instead when you
// need both the chrome AND the public stylesheet.

export interface BaseLayoutProps {
  navigation?: NavigationItem[]
  footer?: boolean
  currentUser: HeaderCurrentUser | null
  pathname: string
  search: string
  children?: ReactNode
}

// Body-chrome wrapper: header + main region + fixed widgets. The wrapping
// `<html>`, `<head>`, and `<body>` live in `root.tsx`'s `Layout` export.
//
// Exported so `tests/snapshot.layout.test.tsx` can render the chrome in
// isolation; production callers should rely on the default `<App>` export
// from `@/root` rather than instantiating `BaseLayout` directly.
export function BaseLayout({ navigation, footer, currentUser, pathname, search, children }: BaseLayoutProps) {
  const navigationSection = useNavigationSettings()
  const showFooter = footer !== undefined ? footer : true
  const resolvedNavigation = navigation || navigationSection.navigation.sideNav
  const logoutQuery = new URLSearchParams({
    action: 'logout',
    redirect_to: `${pathname}${search}`,
  }).toString()

  // Body chrome layout. The `<lg` viewport stacks the sidebar above
  // the main column (`flex-direction: column`); from `lg` upward they
  // sit side-by-side (`flex-direction: row`). The `<main>` flexes to
  // fill all remaining inline space (`flex: 1 1 auto`).
  return (
    <div className="flex flex-col lg:flex-row">
      <Header navigation={resolvedNavigation} currentUser={currentUser} pathname={pathname} search={search} />
      {currentUser && (
        <div className="fixed top-4 right-4 z-50 hidden lg:block">
          <UserMenu currentUser={currentUser} logoutQuery={logoutQuery} />
        </div>
      )}
      <main className="flex flex-1 flex-col">
        {children}
        {showFooter && <Footer />}
      </main>
      {/*
        Fixed-position widget rail anchored bottom-right.

        The legacy `.site-fixed-widget` rule used `bottom: 0;
        transform: translateY(-50%)` to centre a 44 px button on the
        viewport's bottom edge — it relied on the fact that 50% of
        the rail's own height matches half the button. That trick
        coupled the offset to the button height, made the rail's
        `transform` fight `transform-gpu` for the same property, and
        on iOS Safari placed the rail flush against the fold where
        the URL-bar collapse animation repaints every frame (a
        reliable rendering-ghost trigger).

        Stage 11 P9 collapsed the trick into a plain `bottom-5`
        (= 20 px) offset, mirroring `right-5` for visual symmetry
        and giving the rail a stable resting position that does NOT
        depend on its own height. `transform-gpu` is now free to
        own the `transform` property by itself, so iOS Safari
        keeps the rail on a clean compositor layer through URL-bar
        collapse and inertial scroll.

        The `9999` z-index is the legacy "above everything" value —
        kept as a single bare token (`z-9999`) because no other
        public widget needs to sit at the same layer (Lesson 8 —
        sole consumer; promoting it to a named token would only
        buy verbosity).

        The legacy `.site-fixed-widget li { margin: 0 0 1rem }`
        per-item bottom-spacing rule is dead today: the only `<li>`
        in this `<ul>` is `<ScrollTopButton>`, and `<li>` already
        starts at `margin: 0` via reset.css's un-layered `li
        { margin: 0 }` rule.
      */}
      {/*
        The floating ThemeToggle is mobile-only (`<lg`). On `>=lg` the
        Header's social rail is always visible and already carries a
        theme switch next to Search; surfacing a second control there
        would just duplicate it. Below `lg` the side menu folds behind
        the hamburger, so the rail-bound toggle becomes unreachable
        without opening the drawer — the floating widget restores
        one-tap parity. `flex flex-col gap-2` stacks the pair with an
        8px gutter; `ScrollTopButton`'s opacity-based hide leaves a
        spacer when scrolled to the top, which is fine — the rail
        stays visually anchored to the bottom-right.
      */}
      <ul className="fixed right-5 bottom-5 z-9999 flex transform-gpu flex-col gap-2">
        <ScrollTopButton />
        <li className="lg:hidden">
          <ThemeToggle mode="public" variant="floating" />
        </li>
      </ul>
    </div>
  )
}
