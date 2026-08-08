import { useRender } from '@base-ui/react/use-render'
import { PanelLeft } from 'lucide-react'
import { type ComponentProps, createContext, useCallback, use, useMemo, useState } from 'react'

import { Button } from '@/ui/components/button'
import { Separator } from '@/ui/components/separator'
import { Sheet, SheetContent } from '@/ui/components/sheet'
import { Tooltip } from '@/ui/components/tooltip'
import { cn } from '@/ui/lib/cn'
import { type VariantProps, cva } from '@/ui/lib/cva'
import { useMediaQuery } from '@/ui/lib/use-media-query'

interface SidebarContextValue {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = use(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }
  return context
}

interface SidebarProviderProps extends ComponentProps<'div'> {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  children,
  ref,
  ...props
}: SidebarProviderProps) {
  const isMobile = useMediaQuery('(max-width: 767px)', false)
  const [openMobile, setOpenMobile] = useState(false)

  const [_open, _setOpen] = useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(open) : value
      if (setOpenProp) {
        setOpenProp(next)
      } else {
        _setOpen(next)
      }
    },
    [setOpenProp, open],
  )

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((prev) => !prev)
    } else {
      setOpen((prev) => !prev)
    }
  }, [isMobile, setOpen])

  const state = open ? 'expanded' : 'collapsed'

  const contextValue = useMemo<SidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar],
  )

  return (
    <SidebarContext value={contextValue}>
      <div ref={ref} className={cn('group/sidebar-wrapper relative flex h-full w-full', className)} {...props}>
        {children}
      </div>
    </SidebarContext>
  )
}

interface SidebarProps extends ComponentProps<'div'> {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ref,
  ...props
}: SidebarProps) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar()

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          className={cn('w-[90vw] max-w-[24rem] border-r-0 bg-sidebar p-0 text-sidebar-foreground')}
          data-mobile="true"
          data-sidebar="sidebar"
        >
          <nav id="app-sidebar" className="flex size-full flex-col">
            {children}
          </nav>
        </SheetContent>
      </Sheet>
    )
  }

  if (collapsible === 'none') {
    return (
      <nav
        ref={ref}
        className={cn('flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground', className)}
        {...props}
      >
        {children}
      </nav>
    )
  }

  return (
    <nav
      ref={ref}
      className="group peer hidden text-sidebar-foreground md:block"
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-side={side}
      data-state={state}
      data-variant={variant}
    >
      <div
        className={cn(
          'relative h-full w-(--sidebar-width) bg-transparent',
          'group-data-[collapsible=offcanvas]:w-0',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_1.6rem)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
        )}
      />
      <div
        className={cn(
          'absolute inset-y-0 z-10 hidden h-full max-h-dvh w-(--sidebar-width) md:flex',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_1.6rem_+_2px)]'
            : 'border-sidebar-border group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
          className,
        )}
        {...props}
      >
        <div
          className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow"
          data-sidebar="sidebar"
        >
          {children}
        </div>
      </div>
    </nav>
  )
}

function SidebarTrigger({ className, onClick, ref, ...props }: ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      ref={ref}
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn('size-9', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">切换侧边栏</span>
    </Button>
  )
}

function SidebarInset({ className, ref, ...props }: ComponentProps<'div'>) {
  return <div ref={ref} className={cn('relative flex h-full flex-1 flex-col bg-background', className)} {...props} />
}

function SidebarHeader({ className, ref, ...props }: ComponentProps<'div'>) {
  return <div ref={ref} data-slot="sidebar-header" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
}

function SidebarFooter({ className, ref, ...props }: ComponentProps<'div'>) {
  return <div ref={ref} data-slot="sidebar-footer" className={cn('flex flex-col gap-2 p-2', className)} {...props} />
}

function SidebarContent({ className, ref, ...props }: ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-content"
      className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-auto', className)}
      {...props}
    />
  )
}

function SidebarGroup({ className, ref, ...props }: ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ref, ...props }: ComponentProps<'div'>) {
  return <div ref={ref} data-slot="sidebar-group-content" className={cn('w-full text-sm', className)} {...props} />
}

function SidebarMenu({ className, ref, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      ref={ref}
      data-slot="sidebar-menu"
      className={cn('flex w-full min-w-0 flex-col gap-0.5', className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ref, ...props }: ComponentProps<'li'>) {
  return <li ref={ref} data-slot="sidebar-menu-item" className={cn('group/menu-item relative', className)} {...props} />
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 pl-4 text-left text-md font-medium text-sidebar-foreground ring-sidebar-ring outline-hidden transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: '',
        outline:
          'border border-sidebar-border bg-background hover:border-sidebar-accent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      },
      size: {
        default: 'h-sidebar-item text-md',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

interface SidebarMenuButtonProps extends ComponentProps<'button'>, VariantProps<typeof sidebarMenuButtonVariants> {
  isActive?: boolean
  tooltip?: string
  render?: useRender.RenderProp
}

function SidebarMenuButton({
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  render,
  ref,
  ...props
}: SidebarMenuButtonProps) {
  const { isMobile } = useSidebar()

  const button = useRender({
    defaultTagName: 'button',
    render,
    ref,
    props: {
      'data-slot': 'sidebar-menu-button',
      'data-active': isActive,
      'data-size': size,
      ...props,
      className: cn(sidebarMenuButtonVariants({ variant, size }), className),
    },
  })

  if (!tooltip || isMobile) {
    return button
  }

  return (
    <Tooltip.Root>
      <Tooltip.Trigger as="span">{button}</Tooltip.Trigger>
      <Tooltip.Content>{tooltip}</Tooltip.Content>
    </Tooltip.Root>
  )
}

function SidebarMenuBadge({ className, ref, ...props }: ComponentProps<'div'>) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-menu-badge"
      className={cn(
        'pointer-events-none absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-sm font-medium text-muted-foreground tabular-nums select-none',
        'peer-data-[size=sm]/menu-button:top-1.5',
        'peer-data-[size=default]/menu-button:top-2',
        'peer-data-[size=lg]/menu-button:top-3.5',
        'peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenuAction({
  className,
  showOnHover = false,
  ref,
  ...props
}: ComponentProps<'button'> & { showOnHover?: boolean }) {
  return (
    <button
      ref={ref}
      type="button"
      data-slot="sidebar-menu-action"
      className={cn(
        'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'after:absolute after:-inset-2 after:md:hidden',
        'peer-data-[size=sm]/menu-button:top-0.5',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

function SidebarSeparator({ className, ref, ...props }: ComponentProps<typeof Separator>) {
  return (
    <Separator
      ref={ref}
      data-slot="sidebar-separator"
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}
