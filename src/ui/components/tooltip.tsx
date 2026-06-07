import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { type ComponentProps, type ReactNode, createContext, use } from 'react'

import { cn } from '@/ui/lib/cn'

export type TooltipPlacement = 'top' | 'left'

const PUBLIC_BASE_CLASS =
  'pointer-events-none relative z-(--z-tooltip) w-max max-w-[min(24rem,calc(100vw-1rem))] rounded-xs bg-canvas px-2.5 py-1.5 text-admin-sm leading-[1.6] text-ink-1 shadow-tooltip'

const ARROW_CLASS =
  'before:absolute before:size-0 before:border-solid' +
  ' data-[side=top]:before:left-1/2 data-[side=top]:before:-bottom-1.5 data-[side=top]:before:-ml-1.5' +
  ' data-[side=top]:before:border-x-[6px] data-[side=top]:before:border-t-[6px] data-[side=top]:before:border-b-0' +
  ' data-[side=top]:before:border-x-transparent data-[side=top]:before:border-t-(--canvas)' +
  ' data-[side=bottom]:before:left-1/2 data-[side=bottom]:before:-top-1.5 data-[side=bottom]:before:-ml-1.5' +
  ' data-[side=bottom]:before:border-x-[6px] data-[side=bottom]:before:border-b-[6px] data-[side=bottom]:before:border-t-0' +
  ' data-[side=bottom]:before:border-x-transparent data-[side=bottom]:before:border-b-(--canvas)' +
  ' data-[side=left]:before:top-1/2 data-[side=left]:before:-right-1.5 data-[side=left]:before:-mt-1.5' +
  ' data-[side=left]:before:border-y-[6px] data-[side=left]:before:border-l-[6px] data-[side=left]:before:border-r-0' +
  ' data-[side=left]:before:border-y-transparent data-[side=left]:before:border-l-(--canvas)' +
  ' data-[side=right]:before:top-1/2 data-[side=right]:before:-left-1.5 data-[side=right]:before:-mt-1.5' +
  ' data-[side=right]:before:border-y-[6px] data-[side=right]:before:border-r-[6px] data-[side=right]:before:border-l-0' +
  ' data-[side=right]:before:border-y-transparent data-[side=right]:before:border-r-(--canvas)'

const PlacementContext = createContext<TooltipPlacement>('top')

function TooltipProvider({ delay = 0, ...props }: ComponentProps<typeof BaseTooltip.Provider>) {
  return <BaseTooltip.Provider data-slot="tooltip-provider" delay={delay} {...props} />
}

export interface TooltipRootProps {
  children: ReactNode
  placement?: TooltipPlacement
}

function TooltipRoot({ children, placement = 'top' }: TooltipRootProps) {
  return (
    <TooltipProvider delay={0}>
      <BaseTooltip.Root>
        <PlacementContext.Provider value={placement}>{children}</PlacementContext.Provider>
      </BaseTooltip.Root>
    </TooltipProvider>
  )
}

export interface TooltipTriggerProps extends React.ButtonHTMLAttributes<HTMLElement> {
  /** Element type to render. Defaults to `<span>` since tooltips usually wrap inline content. */
  as?: keyof React.JSX.IntrinsicElements
  children: ReactNode
  closeOnClick?: boolean
}

function TooltipTrigger({ as = 'span', children, closeOnClick, ...rest }: TooltipTriggerProps) {
  const Comp = as as React.ElementType
  return <BaseTooltip.Trigger closeOnClick={closeOnClick} render={<Comp {...rest}>{children}</Comp>} />
}

export interface TooltipContentProps {
  children: ReactNode
}

function TooltipContent({ children }: TooltipContentProps) {
  const placement = use(PlacementContext)
  if (children === null || children === undefined || children === false || children === '') {
    return null
  }
  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner side={placement} sideOffset={8}>
        <BaseTooltip.Popup className={cn(PUBLIC_BASE_CLASS, ARROW_CLASS)}>{children}</BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}

export const Tooltip = Object.assign(TooltipRoot, {
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
})

export { TooltipProvider }
