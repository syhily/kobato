import { ChevronRightIcon } from 'lucide-react'
import { type ComponentProps, type ReactNode, createContext, use } from 'react'
import { Link } from 'react-router'

import { useIsActiveLink } from '@/ui/admin/shell/use-is-active-link'
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/ui/components/sidebar'
import { cn } from '@/ui/lib/cn'

/* ------------------------------------------------------------------ */
/*  Collapsible context                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  NavMenuItem root                                                   */
/* ------------------------------------------------------------------ */

function NavMenuItemRoot({ children, ...props }: ComponentProps<typeof SidebarMenuItem>) {
  return <SidebarMenuItem {...props}>{children}</SidebarMenuItem>
}

/* ------------------------------------------------------------------ */
/*  NavMenuLink                                                        */
/* ------------------------------------------------------------------ */

interface NavMenuLinkProps extends ComponentProps<typeof SidebarMenuButton> {
  to?: string
  target?: string
  rel?: string
  activeOnSubpath?: boolean
  isActive?: boolean
  end?: boolean
}

function NavMenuLink({
  to,
  target,
  activeOnSubpath = false,
  isActive: controlledIsActive,
  end = false,
  children,
  ...props
}: NavMenuLinkProps) {
  const computedIsActive = useIsActiveLink(to, activeOnSubpath, end)
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

/* ------------------------------------------------------------------ */
/*  NavMenuLabel                                                       */
/* ------------------------------------------------------------------ */

function NavMenuLabel({ children, className, ...props }: ComponentProps<'span'>) {
  return (
    <span className={cn('truncate', className)} {...props}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  NavMenuCollapsible                                                 */
/* ------------------------------------------------------------------ */

interface NavMenuCollapsibleProps {
  children: ReactNode
  expanded: boolean
  id: string
  onExpandedChange: (expanded: boolean) => void
}

function NavMenuCollapsible({ children, expanded, id, onExpandedChange }: NavMenuCollapsibleProps) {
  return (
    <CollapsibleContext.Provider value={{ expanded, id, onExpandedChange }}>{children}</CollapsibleContext.Provider>
  )
}

/* ------------------------------------------------------------------ */
/*  NavMenuCollapsibleItem                                             */
/* ------------------------------------------------------------------ */

interface NavMenuCollapsibleItemProps {
  ariaLabel: string
  children: ReactNode
}

function NavMenuCollapsibleItem({ ariaLabel, children }: NavMenuCollapsibleItemProps) {
  const { expanded, id, onExpandedChange } = useCollapsibleContext()

  return (
    <NavMenuItemRoot>
      <button
        type="button"
        aria-controls={id}
        aria-expanded={expanded}
        aria-label={ariaLabel}
        className={cn(
          'absolute top-0 left-3 z-10 flex !h-sidebar-item w-auto items-center justify-center',
          'rounded-md p-0 text-sidebar-accent-foreground transition-all',
          'hover:bg-transparent hover:text-sidebar-accent-foreground',
          'focus-visible:opacity-100',
          'group-hover/menu-item:opacity-100 sidebar:opacity-0',
        )}
        onClick={() => onExpandedChange(!expanded)}
      >
        <ChevronRightIcon className={cn('size-4 transition-all', expanded && 'rotate-90')} />
      </button>
      {children}
    </NavMenuItemRoot>
  )
}

/* ------------------------------------------------------------------ */
/*  NavMenuCollapsibleMenu                                             */
/* ------------------------------------------------------------------ */

interface NavMenuCollapsibleMenuProps {
  children: ReactNode
}

function NavMenuCollapsibleMenu({ children }: NavMenuCollapsibleMenuProps) {
  const { expanded, id } = useCollapsibleContext()

  return (
    <ul
      id={id}
      className={cn(
        'grid list-none overflow-hidden p-0 transition-all duration-200 ease-out',
        expanded ? 'mb-5 grid-rows-[1fr]' : 'mb-0 grid-rows-[0fr]',
      )}
    >
      {children}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/*  Namespace assembly                                                 */
/* ------------------------------------------------------------------ */

const NavMenuItem = Object.assign(NavMenuItemRoot, {
  Link: NavMenuLink,
  Label: NavMenuLabel,
  Collapsible: NavMenuCollapsible,
  CollapsibleItem: NavMenuCollapsibleItem,
  CollapsibleMenu: NavMenuCollapsibleMenu,
})

export { NavMenuItem }
