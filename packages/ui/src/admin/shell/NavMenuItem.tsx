import { useIsActiveLink } from '@kobato/ui/admin/shell/use-is-active-link'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@kobato/ui/components/sidebar'
import { cn } from '@kobato/ui/lib/cn'
import { ChevronRightIcon } from 'lucide-react'
import { type ComponentProps, type ReactNode, createContext, use, useMemo, useState } from 'react'
import { Link, matchPath, useLocation } from 'react-router'

interface CollapsibleContextValue {
  expanded: boolean
  id: string
  onExpandedChange: (expanded: boolean) => void
}

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null)

function useCollapsibleContext() {
  const ctx = use(CollapsibleContext)
  if (!ctx) {
    throw new Error('NavMenuItem.Collapsible components must be used within NavMenuItem.Collapsible')
  }
  return ctx
}

function NavMenuItemRoot({ children, ...props }: ComponentProps<typeof SidebarMenuItem>) {
  return <SidebarMenuItem {...props}>{children}</SidebarMenuItem>
}

interface NavMenuLinkProps extends ComponentProps<typeof SidebarMenuButton> {
  to?: string
  target?: string
  rel?: string
  activeMatch?: 'exact' | 'subpath'
  isActive?: boolean
  end?: boolean
}

function NavMenuLink({
  to,
  target,
  activeMatch = 'exact',
  isActive: controlledIsActive,
  end = false,
  children,
  ...props
}: NavMenuLinkProps) {
  const computedIsActive = useIsActiveLink(to, activeMatch === 'subpath', end)
  const isActive = controlledIsActive ?? computedIsActive
  const { isMobile, setOpenMobile } = useSidebar()

  const handleClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  if (target === '_blank') {
    return (
      <SidebarMenuButton
        isActive={isActive}
        render={
          <a
            href={to}
            target="_blank"
            rel="noreferrer noopener"
            aria-current={isActive ? 'page' : undefined}
            onClick={handleClick}
          >
            {children}
          </a>
        }
        {...props}
      />
    )
  }

  return (
    <SidebarMenuButton
      isActive={isActive}
      render={
        <Link to={to ?? '#'} aria-current={isActive ? 'page' : undefined} onClick={handleClick}>
          {children}
        </Link>
      }
      {...props}
    />
  )
}

function NavMenuLabel({ children, className, ...props }: ComponentProps<'span'>) {
  return (
    <span className={cn('truncate', className)} {...props}>
      {children}
    </span>
  )
}

function useMatchAny(paths: string[]): boolean {
  const { pathname } = useLocation()
  return paths.some((path) => matchPath({ path, end: false }, pathname) != null)
}

interface NavMenuCollapsibleProps {
  children: ReactNode
  id: string
  paths?: string[]
}

function NavMenuCollapsible({ children, id, paths = [] }: NavMenuCollapsibleProps) {
  const isActive = useMatchAny(paths)
  const [expanded, setExpanded] = useState(isActive)
  const [wasActive, setWasActive] = useState(isActive)
  if (isActive !== wasActive) {
    setWasActive(isActive)
    if (isActive) {
      setExpanded(true)
    }
  }

  const value = useMemo(() => ({ expanded, id, onExpandedChange: setExpanded }), [expanded, id])
  return <CollapsibleContext value={value}>{children}</CollapsibleContext>
}

interface NavMenuCollapsibleItemProps {
  ariaLabel: string
  children: ReactNode
  action?: ReactNode
}

function NavMenuCollapsibleItem({ ariaLabel, children, action }: NavMenuCollapsibleItemProps) {
  const { expanded, id, onExpandedChange } = useCollapsibleContext()

  return (
    <NavMenuItemRoot>
      <button
        type="button"
        aria-controls={id}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className={cn(
          'absolute top-0 left-4 z-10 flex !h-sidebar-item w-auto items-center justify-center',
          'rounded-xl p-0 text-sidebar-accent-foreground transition-all',
          'hover:bg-transparent hover:text-sidebar-accent-foreground',
          expanded ? 'opacity-100' : 'opacity-0 group-hover/menu-item:opacity-100',
        )}
        onClick={() => onExpandedChange(!expanded)}
      >
        <ChevronRightIcon className={cn('size-4 transition-all', expanded && 'rotate-90')} />
      </button>
      <SidebarMenuButton
        onClick={() => onExpandedChange(!expanded)}
        className={cn(
          '[&>svg]:transition-opacity',
          expanded ? '[&>svg]:opacity-0' : 'group-hover/menu-item:[&>svg]:opacity-0',
        )}
      >
        {children}
      </SidebarMenuButton>
      {action}
    </NavMenuItemRoot>
  )
}

interface NavMenuCollapsibleMenuProps {
  children: ReactNode
}

function NavMenuCollapsibleMenu({ children }: NavMenuCollapsibleMenuProps) {
  const { expanded, id } = useCollapsibleContext()

  return (
    <fieldset
      id={id}
      className={cn(
        'grid overflow-hidden border-0 p-0 transition-all duration-200 ease-out',
        expanded ? 'mb-5 grid-rows-[1fr]' : 'mb-0 grid-rows-[0fr]',
      )}
    >
      <ul className="min-h-0 list-none overflow-hidden p-0">{children}</ul>
    </fieldset>
  )
}

const NavMenuItem = Object.assign(NavMenuItemRoot, {
  Link: NavMenuLink,
  Label: NavMenuLabel,
  Collapsible: NavMenuCollapsible,
  CollapsibleItem: NavMenuCollapsibleItem,
  CollapsibleMenu: NavMenuCollapsibleMenu,
})

export { NavMenuItem }
