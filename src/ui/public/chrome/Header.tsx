import { MenuIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { SocialNetwork } from '@/shared/config/socials'
import type { NavigationItem } from '@/shared/config/types'

import { brandingVersion } from '@/shared/config/utils'
import { useAssetsSettingsOptional, useSiteIdentity, useSocialsSettings } from '@/shared/lib/blog-config-context'
import { Button } from '@/ui/components/button'
import { IconButtonContent } from '@/ui/components/icon-button-content'
import { SOCIAL_NETWORK_ICONS } from '@/ui/icons/brand'
import { cn } from '@/ui/lib/cn'
import { BrandLogo } from '@/ui/public/chrome/BrandLogo'
import { ThemeToggle } from '@/ui/public/chrome/ThemeToggle'
import { UserMenu } from '@/ui/public/chrome/UserMenu'
import { SearchIconButton } from '@/ui/public/Search'
import { QRDialog } from '@/ui/public/widgets/QRDialog'

export interface HeaderCurrentUser {
  id: string
  name: string
  role: 'admin' | 'author' | 'visitor'
}

export interface HeaderProps {
  navigation: NavigationItem[]
  /** Logged-in user identity, or `null` for anonymous visitors. */
  currentUser: HeaderCurrentUser | null
  pathname: string
  search: string
}

// Sticky aside drawer (`<header>`). On `>=lg` the drawer is a fixed-
// width sticky sidebar pinned to the viewport top. On `<lg` it
// collapses to a full-screen overlay that animates opacity /
// visibility / pointer-events when `data-state="open"` flips on. The
// `group/aside` named group lets the inner panel and the dim overlay
// react to the same `data-state` from a single attribute on the
// host (Tailwind v4 named-group syntax — see
// https://tailwindcss.com/docs/hover-focus-and-other-states#named-groups).
//
// The width ladder collapses two source-CSS layers (the legacy
// `.site-aside` width steps AND the `<lg` `position: fixed;
// width: 100%` override) into a single mobile-first chain —
// `max-lg:size-full` for the overlay, `lg:w-[220px]` /
// `xl:w-[260px]` for the sticky steps. The legacy `md..lg
// width: 240px` step is dead code (the `<lg` fixed-overlay rule
// overrides it). The legacy `>=1920px width: 280px` base rule is
// also collapsed (Lesson 8): `xl+` viewports stay at 260px instead
// of stepping back up by 20px on ultra-wide monitors. Anything
// between Tailwind's `2xl` breakpoint (1400px) and 1919px would
// have rendered 260px under the legacy rule too, so the only
// viewport that loses 20px is `>=1920px` (the negligibly-rare
// ultra-wide monitor tier).
const asideShellClass = cn(
  'group/aside',
  'sticky top-0 block h-screen shrink-0',
  'lg:w-[220px] xl:w-[260px]',
  'max-lg:fixed max-lg:size-full',
  'max-lg:pointer-events-none max-lg:invisible max-lg:opacity-0',
  'max-lg:transition-all max-lg:duration-500',
  // `z-(--z-aside-drawer)` reads `--z-aside-drawer: 1020` from
  // `_tokens.css :root` (Tailwind v4 has no `--z-*` namespace that
  // would auto-generate a `z-aside-drawer` named utility, so the
  // arbitrary-value reference is the right tool — Lesson 6 case B).
  'z-(--z-aside-drawer)',
  // Open-state (mobile only): flip visibility + pointer events back
  // on, raise z above the surrounding chrome. `z-50` sits above the
  // sticky `mobile-brand` bar (`z-40`) while the drawer animates open
  // (the 1020 base z keeps the closed drawer above page content but
  // below modals).
  'max-lg:data-[state=open]:opacity-100',
  'max-lg:data-[state=open]:visible',
  'max-lg:data-[state=open]:pointer-events-auto',
  'max-lg:data-[state=open]:z-50',
)

// Aside content panel (`.aside-inner`). On `>=lg` it's a normal flex
// column anchored to the sidebar. On `<lg` it sits fixed at the left
// edge, animates `transform: translateX` between `-100%` (closed)
// and `0` (open), and shrinks to `width: 75%` below the `md`
// breakpoint (the legacy `<md` overlay width). The named-group
// `data-state` driver lives on the parent `<header>`.
const asideInnerClass = cn(
  'flex h-full flex-col bg-aside-bg',
  'max-lg:fixed max-lg:w-[240px]',
  'max-lg:transition-transform max-lg:duration-400 max-lg:ease-in-out',
  'max-lg:-translate-x-full',
  'max-md:w-3/4',
  'max-lg:group-data-[state=open]/aside:translate-x-0',
)

// Aside-overlay button (`.aside-overlay`). `display: none` on `>=lg`
// (the desktop sticky drawer never renders an overlay; preserving
// the `<button>` in the DOM is just a no-op). On `<lg` the overlay
// is always `display: block` for the transition to land on, but
// invisible + non-interactive until the parent `<header>` flips
// `data-state="open"`. Background is the legacy
// `rgba(8, 15, 25, 0.3)` scrim — kept inline (not promoted to a
// token) because it has a single consumer, per Lesson 7.
const asideOverlayClass = cn(
  'hidden',
  'max-lg:pointer-events-none max-lg:invisible max-lg:block',
  'max-lg:group-data-[state=open]/aside:fixed',
  'max-lg:group-data-[state=open]/aside:inset-0',
  'max-lg:group-data-[state=open]/aside:visible',
  'max-lg:group-data-[state=open]/aside:pointer-events-auto',
  'max-lg:group-data-[state=open]/aside:bg-scrim',
)

// Brand `<h1>` (`.navbar-brand`). Hidden on mobile + tablet (the
// `.mobile-brand` row below the header takes over there); shows
// from `lg` upward with two padding steps. The legacy `<lg` padding
// rules are dead code (the element is `display: none` there),
// collapsed away per Lesson 8. The `lg:py-3` / `xl:pt-5` step
// accepts a 3px shrink on `lg..xl` against the legacy 15px, also
// per Lesson 8. Stage 11 P2 dropped the historical `!` modifiers
// — Tailwind utilities land in `@layer utilities`, which beats
// `@layer base` Preflight per the W3C cascade-layers spec, so a
// hypothetical future Preflight write that re-adds `h1 { padding:
// 0 }` would still lose to the inset utilities below.
const navbarBrandClass = cn(
  'shrink-0',
  'flex items-center justify-between',
  'px-5 py-4',
  'lg:px-5 lg:py-3',
  'xl:px-header-brand-x xl:pt-5 xl:pb-header-brand-b',
)

// `<img>` inside the navbar brand. Only ever rendered at `>=lg`
// because the `<h1>` host is `display: none` below that breakpoint;
// the legacy `<md` 50px / `md..lg` 55px max-height rules are dead
// code, collapsed to a single `lg:max-h-15` (60px) step.
const navbarBrandImgClass = 'max-h-10 lg:max-h-15'

// Mobile brand row (`.mobile-brand`) — visible on `<lg` only.
// Mirrors the legacy `display: block` flip in the `<lg` media query
// by inverting the base to `block` + `lg:hidden`. Background
// `#fff` → `bg-canvas`; border `#ebf1f6` → `border-line`
// (both registered in `tailwind.css`'s `@theme inline` block).
const mobileBrandClass = cn('block border-b border-line bg-canvas py-4 lg:hidden', 'sticky top-0 z-40')

// `<img>` inside the mobile brand. Only rendered at `<lg`. The
// legacy ladder shrinks 35px (`<md`) → 40px (`md..lg`); the `max-
// h-9` (36px) base accepts a 1px round-up at the smallest viewport
// per Lesson 8.
const mobileBrandImgClass = 'max-h-9 md:max-h-10'

// Menu toggler trigger (`.menu-toggler`). Inline-flex centred glyph
// on a transparent / borderless host. Tailwind v4 Preflight already
// resets `button { background-image: none; appearance: button }`
// and zeros the user-agent border / outline / shadow, so the host
// chrome lands on the right baseline without an extra reset rule
// (the legacy `reset.css` `button` patches that previously did this
// the same surface). Trailing `text-2xl` sizes the inherited
// `font-size` for any ancestor that consumes `1em` (the lucide-
// react icon explicitly uses a fixed `size=24`, so this is mostly
// defensive).
const menuTogglerClass = cn(
  'inline-flex items-center justify-center',
  'cursor-pointer border-0 bg-transparent p-0',
  'text-2xl leading-none text-ink-1',
  'focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 focus-visible:outline-hidden',
)

// Navigation menu container (`.site-menu`). Element promoted from
// `<div>` to `<nav>` for accessibility — the wrapping `<header>`
// already provides the landmark, but the inner `<nav>` lets screen
// readers describe the list as a navigation region. The
// `flex: 1 1 auto` collapses to Tailwind's `flex-1` (1 1 0%) per
// the established Lesson 8 precedent.
const siteMenuClass = 'flex-1 overflow-hidden'

// `<ul>` inside `.site-menu`. The legacy `md..lg` step (`padding:
// 0.625rem 0.5rem`) shrinks the inline padding by 4px on tablet —
// collapsed to the mobile value per Lesson 8. Stage 11 P2: no `!`
// — `@layer utilities` beats Preflight's `ul { padding: 0 }`.
const siteMenuListClass = 'py-2.5 px-3'

// `<li>` inside `.site-menu li`. Same Stage 11 P2 cleanup as the
// `<ul>` above — utilities ride layer ordering instead of `!`.
const siteMenuItemClass = 'relative block py-3 px-3'

// `<a>` / `<Link>` inside `.site-menu li a`. Hover flips opacity
// from 60% to full and shifts the text from white to the brand
// teal. `font-size: 0.9375rem` is the body baseline (`<body>` font-
// size in `reset.css`), so it inherits without an explicit utility.
const siteMenuLinkClass = cn(
  'relative block cursor-pointer no-underline',
  'text-ink-on-dark opacity-60',
  'hover:text-brand hover:opacity-100',
)

// Submenu rail. Houses the social buttons + Search trigger. The
// padding ladder is three-tier (1:1 with the legacy `.site-
// submenu`):
//
//   <md      (`<768`)   → `padding: 20px 25px` — vertical squeeze
//                         only, inline padding stays at the
//                         default.
//   md..lg   (`>=768`,  → `padding: 25px` — the default tier;
//   xl+      `>=1200`)    full 25px each side.
//   lg-only  (`992..    → `padding: 20px 15px` — both axes
//             1199.98`)   shrink, the only step that drops inline
//                         padding to 15px.
//
// Tailwind v4: `max-md:py-5` covers `<768` (20px vertical) and
// `lg:max-xl:` rides the lg-only window so `>=xl` falls back
// to the default `p-[25px]` rule (24px doesn't visually match —
// stick with the legacy 25px arbitrary value). The 8px inter-
// button gap is supplied by each rail consumer's own `mr-2`
// (see `publicButtonVariants` in `@/ui/primitives/btn` —
// `variant: 'dark'`, `size: 'iconSm'`, `shape: 'circle'`) so an
// off-rail consumer can opt out without a `!`-modifier conflict.
const siteSubmenuClass = cn('shrink-0 p-submenu-p', 'max-md:py-5', 'lg:max-xl:px-submenu-px-lg lg:max-xl:py-5')

// Internal navigation links that target the same site live in `<Link>` so
// React Router can perform client-side transitions and `prefetch` the next
// route's data. External / `target="_blank"` links stay as plain `<a>` since
// they leave the SPA boundary anyway.
function isExternalNavTarget(menu: NavigationItem): boolean {
  if (menu.target === '_blank') {
    return true
  }
  return /^https?:\/\//.test(menu.link)
}

// Public Header brand icon: looks up the icon component for the given
// social network from the canonical `SOCIAL_NETWORK_ICONS` table shared
// with the admin SocialsEditor. Adding a new network requires a single
// edit in `@/ui/icons/brand.ts`.
function SocialNavIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const Icon = SOCIAL_NETWORK_ICONS[network]
  return <Icon className={className} />
}

// The mobile drawer is intentionally NOT migrated to shadcn `Sheet` /
// `@base-ui/react/dialog`. Those primitives only render their popup
// inside a Portal, and our `.site-aside` markup doubles as the
// would require splitting the markup into a portal-rendered mobile
// drawer and a duplicate desktop sidebar with matching class chains —
// the cost of maintaining two parallel menus exceeds the a11y gain
// over the current controlled implementation (Escape listener +
// focus restore + `role="dialog"` + `aria-modal`).
export function Header({ navigation, currentUser, pathname, search }: HeaderProps) {
  const { title } = useSiteIdentity()
  const { socials } = useSocialsSettings()
  const assets = useAssetsSettingsOptional()
  const qs = brandingVersion(assets?.branding)
  const v = qs ? `?v=${qs}` : ''
  const logoutQuery = new URLSearchParams({
    action: 'logout',
    redirect_to: `${pathname}${search}`,
  }).toString()

  // Mobile aside menu open/close state. Owned in React so the drawer
  // closes automatically on route change (we clear the flag whenever
  // the pathname moves) and so the `data-state` attribute on the
  // `<header>` host can drive the cascade for every nested chrome
  // piece via the named-group variants.
  const [menuOpen, setMenuOpen] = useState(false)
  // Track whether we're at the desktop breakpoint (`>=lg`, 1024px). The
  // `<header>` doubles as a modal dialog on `<lg` and as a non-modal
  // sticky sidebar on `>=lg`; the dialog-only ARIA attributes
  // (`role="dialog"`, `aria-modal`, `aria-hidden`, and especially
  // `inert`) MUST NOT apply on desktop, otherwise the always-visible
  // sidebar becomes non-interactive (links / search / socials all
  // dead). Default to `true` so the SSR HTML doesn't ship `inert` on
  // the desktop sidebar — the first client paint reconciles the value
  // from `matchMedia`.
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  // Reference to the trigger button so we can return focus to it when
  // the dialog closes — without this, keyboard users land at the top of
  // the document on Escape, which violates WAI-ARIA APG §"Restoring
  // focus" for modal dialogs.
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuLabelId = useId()

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])
  // Both "Escape closes the drawer" and "restore focus to the trigger on
  // close" live in a single effect keyed by `menuOpen`. When the drawer
  // opens we only attach the Escape listener; when it closes the cleanup
  // also snaps focus back to the trigger so keyboard users don't land at
  // the top of the document (WAI-ARIA APG §"Restoring focus"). The
  // trigger button is captured inside the effect so the cleanup
  // reads a stable reference instead of the mutable `ref.current`.
  useEffect(() => {
    if (!menuOpen) {
      return
    }
    const trigger = triggerRef.current
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      trigger?.focus({ preventScroll: true })
    }
  }, [menuOpen])

  return (
    <>
      <header
        // `data-state` drives the named-group cascade on the inner
        // translate-flip panel and the dismiss overlay below. Open/
        // closed state lives in a single attribute the rest of the
        // chrome subscribes to via Tailwind v4's
        // `group-data-[state=open]/aside:` variant — no need for
        // cn() conditionals on every nested child.
        data-state={menuOpen ? 'open' : 'closed'}
        className={asideShellClass}
        // The mobile aside is a modal navigation drawer when open; mark
        // it as such so screen readers announce the role and trap
        // virtual focus (along with `inert` on background content,
        // which the `data-state="open"` overlay above already
        // covers visually).
        role={isDesktop ? undefined : 'dialog'}
        aria-modal={!isDesktop && menuOpen ? true : undefined}
        aria-labelledby={menuLabelId}
        aria-hidden={!isDesktop && !menuOpen ? true : undefined}
        inert={!isDesktop && !menuOpen ? true : undefined}
      >
        {/*
         * Overlay is a real button (not a `<div onClick>`) so keyboard
         * users can dismiss the menu without a mouse: focus the
         * overlay and press Enter/Space, or simply hit Escape (the
         * effect above wires that up too). `tabIndex={-1}` keeps it
         * out of the natural tab order — Escape and the dedicated
         * "关闭" affordance inside `.site-menu` are the primary close
         * paths.
         *
         * `aria-hidden="true"`: mobile VoiceOver would otherwise read
         * the overlay's accessible name in addition to the real close
         * triggers inside the aside, resulting in two "关闭主菜单"
         * announcements for the same dismissal path.
         *
         * On `>=lg` desktop the overlay is `display: none` (the
         * sticky drawer never opens that wide), so it stays in the
         * DOM as a no-op. Keeping it always-mounted means React
         * doesn't re-create the element on every breakpoint flip and
         * the focus restore in the Escape handler can rely on the
         * trigger button outliving the overlay's lifecycle.
         */}
        <button
          type="button"
          className={asideOverlayClass}
          aria-hidden
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
        <div className={asideInnerClass}>
          <h1 id={menuLabelId} className={navbarBrandClass}>
            <Link to="/" title={title} className="block" prefetch="intent">
              <img src={`/logo-dark.svg${v}`} alt="且听书吟" width={60} height={60} className={navbarBrandImgClass} />
            </Link>
          </h1>
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
          <nav className={siteMenuClass} onClick={() => setMenuOpen(false)}>
            <ul className={siteMenuListClass}>
              {navigation.map((menu) => (
                <li key={`menu-${menu.link}`} className={siteMenuItemClass}>
                  {isExternalNavTarget(menu) ? (
                    <a href={menu.link} target={menu.target} className={siteMenuLinkClass}>
                      {menu.text}
                    </a>
                  ) : (
                    <Link to={menu.link} prefetch="intent" className={siteMenuLinkClass}>
                      {menu.text}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className={siteSubmenuClass}>
            {socials.map((social) => {
              if (social.type === 'qrcode') {
                return (
                  <QRDialog
                    key={social.name}
                    url={social.link}
                    name={social.name}
                    title={social.title ?? social.name}
                    trigger={<SocialNavIcon network={social.network} className="m-icon-inset" />}
                  />
                )
              }
              return (
                <Button
                  key={social.name}
                  variant="dark"
                  size="iconSm"
                  shape="circle"
                  className="mr-2"
                  render={
                    <a href={social.link} target="_blank" rel="noreferrer" aria-label={social.title ?? social.name} />
                  }
                  title={social.title ?? social.name}
                >
                  <IconButtonContent>
                    <SocialNavIcon network={social.network} className="m-icon-inset" />
                  </IconButtonContent>
                </Button>
              )
            })}
            <ThemeToggle mode="public" />
            <SearchIconButton />
          </div>
        </div>
      </header>
      <div className={mobileBrandClass}>
        <div className="mx-auto w-full px-3 sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl 2xl:max-w-2xl">
          <div className="flex items-center">
            <Link to="/" title={title} className="block" prefetch="intent">
              <BrandLogo className={mobileBrandImgClass} />
            </Link>
            <div className="flex-1" />
            {currentUser && (
              <div className="mr-3">
                <UserMenu currentUser={currentUser} logoutQuery={logoutQuery} />
              </div>
            )}
            <button
              ref={triggerRef}
              type="button"
              className={menuTogglerClass}
              aria-label="打开主菜单"
              aria-expanded={menuOpen}
              aria-controls={menuLabelId}
              aria-haspopup="dialog"
              onClick={() => setMenuOpen(true)}
            >
              {/*
               * Sized in absolute pixels, not the legacy `1em` (icon-font
               * era) idiom, because lucide-react renders the `size` prop
               * onto the SVG's `width`/`height` attributes — and even
               * though `1em` would in theory inherit the button's
               * `font-size`, in practice this codebase's lucide build
               * resolves the attribute to a fixed value at render time
               * and the SVG never reflows when the surrounding text
               * scale changes. Hard-pinning to 24 (= `size-6`) keeps
               * the icon visually balanced against the adjacent
               * `mobile-brand` logo without coupling its dimensions to
               * the unrelated text-size utility on the parent button.
               */}
              <MenuIcon className="block" size={24} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
