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
import { safeRel } from '@/ui/lib/link'
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

const asideShellClass = cn(
  'group/aside',
  'sticky top-0 block h-screen shrink-0',
  'lg:w-[220px] xl:w-[260px]',
  'max-lg:fixed max-lg:size-full',
  'max-lg:pointer-events-none max-lg:invisible max-lg:opacity-0',
  'max-lg:transition-all max-lg:duration-500',
  'z-aside-drawer',
  'max-lg:data-[state=open]:opacity-100',
  'max-lg:data-[state=open]:visible',
  'max-lg:data-[state=open]:pointer-events-auto',
  'max-lg:data-[state=open]:z-50',
)

const asideInnerClass = cn(
  'flex h-full flex-col bg-aside-bg',
  'max-lg:fixed max-lg:w-[240px]',
  'max-lg:transition-transform max-lg:duration-400 max-lg:ease-in-out',
  'max-lg:-translate-x-full',
  'max-md:w-3/4',
  'max-lg:group-data-[state=open]/aside:translate-x-0',
)

const asideOverlayClass = cn(
  'hidden',
  'max-lg:pointer-events-none max-lg:invisible max-lg:block',
  'max-lg:group-data-[state=open]/aside:fixed',
  'max-lg:group-data-[state=open]/aside:inset-0',
  'max-lg:group-data-[state=open]/aside:visible',
  'max-lg:group-data-[state=open]/aside:pointer-events-auto',
  'max-lg:group-data-[state=open]/aside:bg-scrim',
)

const navbarBrandClass = cn(
  'shrink-0',
  'flex items-center justify-between',
  'px-5 py-4',
  'lg:px-5 lg:py-3',
  'xl:px-header-brand-x xl:pt-5 xl:pb-header-brand-b',
)

const navbarBrandImgClass = 'max-h-10 lg:max-h-15'

const mobileBrandClass = cn('block border-b border-line bg-canvas py-4 lg:hidden', 'sticky top-0 z-40')

const mobileBrandImgClass = 'max-h-9 md:max-h-10'

const menuTogglerClass = cn(
  'inline-flex items-center justify-center',
  'cursor-pointer border-0 bg-transparent p-0',
  'text-2xl leading-none text-ink-1',
  'focus-visible:ring-(--ring-width) focus-visible:ring-ring/50 focus-visible:outline-hidden',
)

const siteMenuClass = 'flex-1 overflow-hidden'

const siteMenuListClass = 'py-2.5 px-3'

const siteMenuItemClass = 'relative block py-3 px-3'

const siteMenuLinkClass = cn(
  'relative block cursor-pointer no-underline',
  'text-ink-on-dark opacity-60',
  'hover:text-brand hover:opacity-100',
)

const siteSubmenuClass = cn('shrink-0 p-submenu-p', 'max-md:py-5', 'lg:max-xl:px-submenu-px-lg lg:max-xl:py-5')

function isExternalNavTarget(menu: NavigationItem): boolean {
  if (menu.target === '_blank') {
    return true
  }
  return /^https?:\/\//.test(menu.link)
}

function SocialNavIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  const Icon = SOCIAL_NETWORK_ICONS[network]
  return <Icon className={className} />
}

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

  const [menuOpen, setMenuOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [])
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuLabelId = useId()

  const [lastPathname, setLastPathname] = useState(pathname)
  if (pathname !== lastPathname) {
    setLastPathname(pathname)
    setMenuOpen(false)
  }
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
        data-state={menuOpen ? 'open' : 'closed'}
        className={asideShellClass}
        role={isDesktop ? undefined : 'dialog'}
        aria-modal={!isDesktop && menuOpen ? true : undefined}
        aria-labelledby={menuLabelId}
        aria-hidden={!isDesktop && !menuOpen ? true : undefined}
        inert={!isDesktop && !menuOpen ? true : undefined}
      >
        {/* Dismiss overlay — real button so keyboard users can close the drawer. */}
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
                    <a
                      href={menu.link}
                      target={menu.target}
                      rel={safeRel(menu.target, undefined)}
                      className={siteMenuLinkClass}
                    >
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
              {/* Fixed pixel size for consistent icon rendering. */}
              <MenuIcon className="block" size={24} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
